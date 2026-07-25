"use client";

import {
  ChevronLeft,
  ChevronRight,
  Code2,
  Database,
  ExternalLink,
  Eye,
  Loader2,
  MessageSquare,
  Monitor,
  MousePointer2,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ProjectFile } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { PreviewRoute } from "@/lib/preview/routes";
import {
  applyTextToProjectFiles,
  type VisualEditSelection,
} from "@/lib/preview/apply-visual-edit";
import {
  VisualEditPanel,
  selectionToDraft,
  type VisualEditDraft,
} from "@/components/preview/visual-edit-panel";
import { ProjectCodeEditor } from "@/components/preview/project-code-editor";
import { previewApiUrl } from "@/lib/preview/client-api-url";
import { useShell } from "@/components/chat/shell-context";

type PreviewStatus = "idle" | "syncing" | "ready" | "error";

function filesFingerprint(
  files: ProjectFile[],
  packages: Record<string, string>,
  imageDataUrls: Record<string, string>,
): string {
  let hash = `${files.length}:${Object.keys(packages).sort().join(",")}:${Object.keys(imageDataUrls).length}`;
  for (const f of files) {
    hash += `|${f.path}:${f.code.length}:${f.code.slice(0, 24)}:${f.code.slice(-24)}`;
  }
  for (const [k, v] of Object.entries(packages).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    hash += `|pkg:${k}@${v}`;
  }
  return hash;
}

type PreviewTool = "browse" | "visual";

export function CodePreview({
  files,
  projectId,
  chatId,
  imageDataUrls = {},
  packages = {},
  /** While the agent is streaming, skip preview syncs (rebuild only when the turn ends). */
  streaming = false,
  onPreviewReady,
  onFilesChange,
}: {
  files: ProjectFile[];
  projectId: string | null;
  chatId: string;
  imageDataUrls?: Record<string, string>;
  packages?: Record<string, string>;
  streaming?: boolean;
  onPreviewReady?: () => void;
  onFilesChange?: (files: ProjectFile[]) => void;
}) {
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [previewTool, setPreviewTool] = useState<PreviewTool>("browse");
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [selection, setSelection] = useState<VisualEditSelection | null>(null);
  const [draft, setDraft] = useState<VisualEditDraft | null>(null);
  const [baseSelection, setBaseSelection] = useState<VisualEditSelection | null>(
    null,
  );
  const [applying, setApplying] = useState(false);
  const baseTextRef = useRef("");
  const { toggleSidebar } = useShell();
  const [status, setStatus] = useState<PreviewStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [routes, setRoutes] = useState<PreviewRoute[]>([]);
  const [activePath, setActivePath] = useState("/");
  const [iframeKey, setIframeKey] = useState(0);
  const syncGen = useRef(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const baseUrlRef = useRef<string | null>(null);
  const wasStreaming = useRef(false);
  const lastSyncedFp = useRef<string>("");
  const inFlightFp = useRef<string | null>(null);
  const onReadyRef = useRef(onPreviewReady);
  onReadyRef.current = onPreviewReady;

  const filesRef = useRef(files);
  const packagesRef = useRef(packages);
  const imagesRef = useRef(imageDataUrls);
  filesRef.current = files;
  packagesRef.current = packages;
  imagesRef.current = imageDataUrls;

  const pageRoutes = useMemo(
    () => routes.filter((r) => r.kind === "page"),
    [routes],
  );

  const previewSrc = baseUrl
    ? `${baseUrl}${activePath === "/" ? "" : activePath}`
    : null;

  const softReloadIframe = useCallback(() => {
    const frame = iframeRef.current;
    if (!frame?.contentWindow) return;
    try {
      frame.contentWindow.location.reload();
    } catch {
      setIframeKey((k) => k + 1);
    }
  }, []);

  const routePaths = useMemo(
    () =>
      pageRoutes.length
        ? pageRoutes.map((r) => r.path)
        : ["/"],
    [pageRoutes],
  );

  const routeIndex = routePaths.indexOf(activePath);
  const canGoBack = routeIndex > 0;
  const canGoForward =
    routeIndex >= 0 && routeIndex < routePaths.length - 1;

  const displayPath = activePath === "/" ? "/" : activePath;
  const displayUrl = baseUrl
    ? `${baseUrl.replace(/^https?:\/\//, "")}${displayPath === "/" ? "" : displayPath}`
    : "Starting preview…";

  const goRoute = useCallback(
    (delta: -1 | 1) => {
      const idx = routePaths.indexOf(activePath);
      const next = idx + delta;
      if (next >= 0 && next < routePaths.length) {
        setActivePath(routePaths[next]!);
      }
    },
    [activePath, routePaths],
  );

  const reloadPreview = useCallback(() => {
    if (status === "syncing") return;
    setIframeKey((k) => k + 1);
    softReloadIframe();
  }, [status, softReloadIframe]);

  const postToInspector = useCallback(
    (type: string, payload?: Record<string, unknown>) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      win.postMessage({ source: "luca-parent", type, ...payload }, "*");
    },
    [],
  );

  useEffect(() => {
    if (tab !== "preview") return;
    postToInspector("set-mode", {
      mode: previewTool === "visual" ? "inspect" : "off",
    });
  }, [tab, previewTool, iframeKey, previewSrc, postToInspector]);

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const d = ev.data;
      if (!d || d.source !== "luca-inspector") return;
      if (d.type === "select" && d.payload) {
        const sel = d.payload as VisualEditSelection;
        setSelection(sel);
        setBaseSelection(sel);
        baseTextRef.current = sel.text;
        setDraft(selectionToDraft(sel));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (previewTool !== "visual" || !draft || !selection) return;
    const t = setTimeout(() => {
      postToInspector("apply-live", {
        payload: {
          text: draft.text,
          fontSize: draft.fontSize,
          fontWeight: draft.fontWeight,
          fontStyle: draft.fontStyle,
          color: draft.color,
        },
      });
    }, 80);
    return () => clearTimeout(t);
  }, [draft, previewTool, selection, postToInspector]);

  const handleResetVisual = useCallback(() => {
    if (baseSelection) {
      setSelection(baseSelection);
      setDraft(selectionToDraft(baseSelection));
      postToInspector("apply-live", {
        payload: selectionToDraft(baseSelection),
      });
    }
  }, [baseSelection, postToInspector]);

  const exitVisual = useCallback(() => {
    setPreviewTool("browse");
    setSelection(null);
    setDraft(null);
    setBaseSelection(null);
    postToInspector("clear-selection");
    postToInspector("set-mode", { mode: "off" });
  }, [postToInspector]);

  const syncPreview = useCallback(
    async (opts?: { restart?: boolean; force?: boolean }) => {
      const currentFiles = filesRef.current;
      const currentPackages = packagesRef.current;
      const currentImages = imagesRef.current;
      if (!currentFiles.length || !chatId) return;

      const fp = filesFingerprint(currentFiles, currentPackages, currentImages);
      if (
        !opts?.force &&
        !opts?.restart &&
        (fp === lastSyncedFp.current || fp === inFlightFp.current)
      ) {
        return;
      }

      const gen = ++syncGen.current;
      inFlightFp.current = fp;
      const hadUrl = Boolean(baseUrlRef.current);
      if (!hadUrl) setStatus("syncing");
      setError(null);
      try {
        const res = await fetch(previewApiUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId,
            files: currentFiles,
            imageDataUrls: currentImages,
            packages: currentPackages,
            restart: opts?.restart,
          }),
        });
        const data = (await res.json()) as {
          url?: string;
          routes?: PreviewRoute[];
          defaultRoute?: string;
          error?: string;
          status?: string;
          depsChanged?: boolean;
        };
        if (gen !== syncGen.current) return;
        if (!res.ok) {
          throw new Error(data.error || "Failed to start preview");
        }
        const nextUrl = data.url ?? null;
        const urlChanged = nextUrl !== baseUrlRef.current;
        setBaseUrl(nextUrl);
        baseUrlRef.current = nextUrl;
        setRoutes(data.routes ?? []);
        if (nextUrl) onReadyRef.current?.();
        setActivePath((prev) => {
          const paths = (data.routes ?? [])
            .filter((r) => r.kind === "page")
            .map((r) => r.path);
          if (paths.includes(prev)) return prev;
          return data.defaultRoute || paths[0] || prev;
        });
        setStatus("ready");
        lastSyncedFp.current = fp;
        if (opts?.restart || data.depsChanged || urlChanged || !hadUrl) {
          setIframeKey((k) => k + 1);
        } else if (opts?.force) {
          softReloadIframe();
        }
      } catch (err) {
        if (gen !== syncGen.current) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Preview failed");
      } finally {
        if (inFlightFp.current === fp) inFlightFp.current = null;
      }
    },
    [chatId, softReloadIframe],
  );

  const handleApplyVisual = useCallback(async () => {
    if (!draft || !baseSelection || !onFilesChange) return;
    setApplying(true);
    try {
      const next = applyTextToProjectFiles(
        files,
        activePath,
        baseTextRef.current,
        draft.text,
      );
      if (next) {
        onFilesChange(next);
        baseTextRef.current = draft.text.trim();
        setBaseSelection({ ...baseSelection, text: draft.text });
        await syncPreview({ force: true });
      }
    } finally {
      setApplying(false);
    }
  }, [
    activePath,
    baseSelection,
    draft,
    files,
    onFilesChange,
    syncPreview,
  ]);

  const contentFp = useMemo(
    () => filesFingerprint(files, packages, imageDataUrls),
    [files, packages, imageDataUrls],
  );

  useEffect(() => {
    if (!files.length || streaming) return;
    if (contentFp === lastSyncedFp.current) return;
    const t = setTimeout(() => {
      void syncPreview();
    }, 450);
    return () => clearTimeout(t);
  }, [contentFp, files.length, streaming, syncPreview]);

  useEffect(() => {
    if (wasStreaming.current && !streaming && files.length) {
      if (contentFp !== lastSyncedFp.current) {
        void syncPreview({ force: true });
      }
    }
    wasStreaming.current = streaming;
  }, [streaming, files.length, contentFp, syncPreview]);

  useEffect(() => {
    if (!pageRoutes.length) return;
    if (!pageRoutes.some((r) => r.path === activePath)) {
      const login =
        pageRoutes.find((r) =>
          /^\/(auth\/)?(login|signin|sign-in)$/i.test(r.path),
        )?.path || pageRoutes[0].path;
      setActivePath(login);
    }
  }, [pageRoutes, activePath]);

  const iconBtn = (
    active: boolean,
    onClick: () => void,
    title: string,
    icon: ReactNode,
    disabled?: boolean,
  ) => (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 w-8 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-30",
        active
          ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/35"
          : "text-zinc-500 hover:text-zinc-300",
      )}
    >
      {icon}
    </button>
  );

  if (!files.length) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950 text-sm text-zinc-500">
        Preview appears when the agent generates a project
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-zinc-800 px-2 lg:px-3">
        <button
          type="button"
          onClick={toggleSidebar}
          title="Toggle sidebar"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
        >
          <MessageSquare className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-0.5 rounded-lg border border-zinc-800/80 bg-zinc-900/60 p-0.5">
          {iconBtn(
            tab === "preview" && previewTool === "browse",
            () => {
              setTab("preview");
              setPreviewTool("browse");
            },
            "Preview",
            <Eye className="h-4 w-4" />,
          )}
          {iconBtn(
            tab === "preview" && previewTool === "visual",
            () => {
              setTab("preview");
              setPreviewTool("visual");
            },
            "Visual edit",
            <MousePointer2 className="h-4 w-4" />,
          )}
          {iconBtn(
            tab === "code",
            () => {
              setTab("code");
              setPreviewTool("browse");
            },
            "Edit code",
            <Code2 className="h-4 w-4" />,
          )}
          {iconBtn(
            false,
            () => {},
            "Environment",
            <Database className="h-4 w-4" />,
            true,
          )}
        </div>

        {tab === "preview" ? (
          <div className="flex min-w-0 flex-1 justify-center px-1">
            <div className="flex w-full max-w-[420px] items-center gap-0.5 rounded-lg border border-zinc-800 bg-zinc-900/40 px-1 py-0.5">
              <button
                type="button"
                title="Back"
                disabled={!canGoBack}
                onClick={() => goRoute(-1)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="Forward"
                disabled={!canGoForward}
                onClick={() => goRoute(1)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <span className="mx-0.5 h-4 w-px shrink-0 bg-zinc-800" />
              <button
                type="button"
                title={
                  viewport === "mobile"
                    ? "Switch to desktop"
                    : "Switch to mobile"
                }
                onClick={() =>
                  setViewport((v) => (v === "mobile" ? "desktop" : "mobile"))
                }
                className={cn(
                  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                  viewport === "mobile"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200",
                )}
              >
                {viewport === "mobile" ? (
                  <Smartphone className="h-3.5 w-3.5" />
                ) : (
                  <Monitor className="h-3.5 w-3.5" />
                )}
              </button>
              <span
                className="min-w-0 flex-1 truncate px-1 font-mono text-[11px] text-zinc-400"
                title={displayUrl}
              >
                {displayUrl}
              </span>
              <button
                type="button"
                title="Reload"
                onClick={reloadPreview}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5",
                    status === "syncing" && "animate-spin",
                  )}
                />
              </button>
              {previewSrc ? (
                <a
                  href={previewSrc}
                  target="_blank"
                  rel="noreferrer"
                  title="Open in new tab"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center opacity-30">
                  <ExternalLink className="h-3.5 w-3.5 text-zinc-500" />
                </span>
              )}
            </div>
          </div>
        ) : (
          <span className="min-w-0 flex-1 truncate text-center text-xs text-zinc-500">
            {projectId || "Code Project"} · {files.length} files
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {tab === "code" ? (
          <ProjectCodeEditor
            files={files}
            projectId={projectId}
            packages={packages}
            onFilesChange={onFilesChange}
          />
        ) : (
          <>
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col items-center bg-zinc-900">
              {status === "syncing" && !baseUrl && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-zinc-950/90 text-sm text-zinc-300">
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                  <p>Starting Next.js preview…</p>
                  <p className="max-w-sm text-center text-xs text-zinc-500">
                    First run installs dependencies into a local runtime (one-time).
                    Full App Router + API routes supported.
                  </p>
                </div>
              )}
              {status === "error" && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-zinc-950 px-6 text-center">
                  <p className="text-sm text-red-400">Preview failed</p>
                  <pre className="max-h-40 max-w-lg overflow-auto whitespace-pre-wrap rounded-md border border-zinc-800 bg-zinc-900 p-3 text-left text-[11px] text-zinc-400">
                    {error}
                  </pre>
                  <button
                    type="button"
                    onClick={() =>
                      void syncPreview({ restart: true, force: true })
                    }
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                  >
                    Retry
                  </button>
                </div>
              )}
              {previewSrc ? (
                <div
                  className={cn(
                    "h-full min-h-0 shrink-0 bg-white transition-[width] duration-200",
                    viewport === "mobile"
                      ? "w-[390px] max-w-full border-x border-zinc-800 shadow-xl"
                      : "w-full",
                  )}
                >
                  <iframe
                    ref={iframeRef}
                    key={`${iframeKey}:${previewSrc}:${viewport}`}
                    title="Next.js preview"
                    src={previewSrc}
                    className="h-full w-full border-0 bg-white"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                  />
                </div>
              ) : null}
              {status === "ready" && baseUrl && previewTool !== "visual" && (
                <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-zinc-950/70 px-2 py-0.5 text-[10px] text-zinc-500">
                  Real Next.js · {baseUrl.replace("http://", "")}
                </div>
              )}
            </div>
            {previewTool === "visual" ? (
              <VisualEditPanel
                selection={selection}
                draft={draft}
                onDraftChange={setDraft}
                onApply={() => void handleApplyVisual()}
                onReset={handleResetVisual}
                onClose={exitVisual}
                applying={applying}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

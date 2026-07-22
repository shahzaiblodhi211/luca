"use client";

import {
  SandpackProvider,
  SandpackLayout,
  SandpackCodeEditor,
  SandpackFileExplorer,
} from "@codesandbox/sandpack-react";
import { nightOwl } from "@codesandbox/sandpack-themes";
import {
  ExternalLink,
  Globe,
  Loader2,
  Monitor,
  RefreshCw,
  Code2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectFile } from "@/lib/types";
import { toSandpackFiles } from "@/lib/sandpack-files";
import { resolveSandpackDependencies } from "@/lib/sandpack-deps";
import { cn } from "@/lib/utils";
import type { PreviewRoute } from "@/lib/preview/routes";

type PreviewStatus = "idle" | "syncing" | "ready" | "error";

export function CodePreview({
  files,
  projectId,
  chatId,
  imageDataUrls = {},
  packages = {},
  /** While the agent is streaming, skip preview syncs (rebuild only when the turn ends). */
  streaming = false,
  onPreviewReady,
}: {
  files: ProjectFile[];
  projectId: string | null;
  chatId: string;
  imageDataUrls?: Record<string, string>;
  packages?: Record<string, string>;
  streaming?: boolean;
  onPreviewReady?: () => void;
}) {
  const [tab, setTab] = useState<"preview" | "code">("preview");
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

  const pack = useMemo(
    () => toSandpackFiles(files, imageDataUrls),
    [files, imageDataUrls],
  );
  const dependencies = useMemo(
    () => resolveSandpackDependencies(files),
    [files],
  );
  const sandpackKey = useMemo(
    () =>
      `${projectId || "project"}:${files.map((f) => f.path).join("|")}:${Object.keys(imageDataUrls).length}:${Object.keys(dependencies).sort().join(",")}:${files.reduce((n, f) => n + f.code.length, 0)}`,
    [files, projectId, imageDataUrls, dependencies],
  );

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

  const syncPreview = useCallback(
    async (opts?: { restart?: boolean }) => {
      if (!files.length || !chatId) return;
      const gen = ++syncGen.current;
      const hadUrl = Boolean(baseUrlRef.current);
      // Keep showing the live iframe while we push new files (don't flash "Starting…")
      if (!hadUrl) setStatus("syncing");
      setError(null);
      try {
        const res = await fetch("/api/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId,
            files,
            imageDataUrls,
            packages,
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
        if (nextUrl) onPreviewReady?.();
        // Keep the user's current route unless it's gone
        setActivePath((prev) => {
          const paths = (data.routes ?? [])
            .filter((r) => r.kind === "page")
            .map((r) => r.path);
          if (paths.includes(prev)) return prev;
          return data.defaultRoute || paths[0] || prev;
        });
        setStatus("ready");
        // Hard-remount only when needed — remounting on every edit made preview lag.
        // Otherwise write-to-disk + soft reload / Fast Refresh updates in place.
        if (opts?.restart || data.depsChanged || urlChanged || !hadUrl) {
          setIframeKey((k) => k + 1);
        } else {
          softReloadIframe();
        }
      } catch (err) {
        if (gen !== syncGen.current) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Preview failed");
      }
    },
    [chatId, files, imageDataUrls, packages, softReloadIframe, onPreviewReady],
  );

  // Never rebuild preview while the agent is streaming — mid-build syncs
  // (npm install / Next boot) were adding 30–70s and stalling the chat.
  useEffect(() => {
    if (!files.length || streaming) return;
    const t = setTimeout(() => {
      void syncPreview();
    }, 350);
    return () => clearTimeout(t);
  }, [files, imageDataUrls, packages, chatId, syncPreview, streaming]);

  // Flush preview as soon as the agent turn ends
  useEffect(() => {
    if (wasStreaming.current && !streaming && files.length) {
      void syncPreview();
    }
    wasStreaming.current = streaming;
  }, [streaming, files.length, syncPreview]);

  // Keep active path valid when routes update (prefer server defaultRoute on sync)
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

  if (!files.length) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950 text-sm text-zinc-500">
        Preview appears when the agent generates a project
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
        <div className="flex items-center gap-1 rounded-lg bg-zinc-900 p-0.5">
          <button
            type="button"
            onClick={() => setTab("preview")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium",
              tab === "preview"
                ? "bg-sky-600 text-white"
                : "text-zinc-400 hover:text-zinc-200",
            )}
          >
            <Globe className="h-3.5 w-3.5" />
            Preview
          </button>
          <button
            type="button"
            onClick={() => setTab("code")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium",
              tab === "code"
                ? "bg-zinc-100 text-zinc-900"
                : "text-zinc-400 hover:text-zinc-200",
            )}
          >
            <Code2 className="h-3.5 w-3.5" />
            Code
          </button>
        </div>

        {tab === "preview" && (
          <>
            <Monitor className="ml-1 hidden h-4 w-4 text-zinc-500 sm:block" />
            <div className="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/80 px-2 py-1">
              <button
                type="button"
                title="Refresh"
                onClick={() => setIframeKey((k) => k + 1)}
                className="rounded p-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5",
                    status === "syncing" && "animate-spin",
                  )}
                />
              </button>
              <select
                value={activePath || "/"}
                onChange={(e) => setActivePath(e.target.value || "/")}
                className="min-w-0 flex-1 truncate bg-transparent text-xs text-zinc-200 outline-none"
                aria-label="Preview route"
              >
                {(pageRoutes.length
                  ? pageRoutes
                  : [{ path: "/", label: "Homepage", kind: "page" as const }]
                ).map((r) => (
                  <option key={r.path} value={r.path}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            {previewSrc && (
              <a
                href={previewSrc}
                target="_blank"
                rel="noreferrer"
                title="Open in new tab"
                className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </>
        )}

        {tab === "code" && (
          <span className="ml-auto truncate text-xs text-zinc-500">
            {projectId || "Code Project"} · {files.length} files
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1">
        {tab === "code" ? (
          <div className="sandpack-root h-full min-h-0">
            <SandpackProvider
              key={sandpackKey}
              template="react-ts"
              theme={nightOwl}
              files={pack.files}
              options={{
                activeFile: pack.activeFile,
                visibleFiles: Object.keys(pack.files).filter(
                  (p) =>
                    !p.includes("/components/ui/") && p !== "/lib/utils.ts",
                ),
                recompileMode: "delayed",
                autorun: false,
              }}
              customSetup={{ dependencies }}
              style={{ height: "100%" }}
            >
              <SandpackLayout className="sandpack-layout">
                <SandpackFileExplorer
                  style={{ height: "100%", minWidth: 160 }}
                />
                <SandpackCodeEditor
                  showTabs
                  showLineNumbers
                  showInlineErrors
                  style={{ height: "100%", flex: 1 }}
                />
              </SandpackLayout>
            </SandpackProvider>
          </div>
        ) : (
          <div className="relative flex h-full min-h-0 flex-col bg-zinc-900">
            {status === "syncing" && !baseUrl && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-zinc-950/90 text-sm text-zinc-300">
                <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
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
                  onClick={() => void syncPreview({ restart: true })}
                  className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
                >
                  Retry
                </button>
              </div>
            )}
            {previewSrc ? (
              <iframe
                ref={iframeRef}
                key={`${iframeKey}:${previewSrc}`}
                title="Next.js preview"
                src={previewSrc}
                className="h-full w-full border-0 bg-white"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              />
            ) : null}
            {status === "ready" && baseUrl && (
              <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-zinc-950/70 px-2 py-0.5 text-[10px] text-zinc-500">
                Real Next.js · {baseUrl.replace("http://", "")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

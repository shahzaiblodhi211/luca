"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlansModal } from "@/components/billing/plans-modal";
import { PromptForm } from "./prompt-form";
import { EnvVarsModal } from "./env-vars-modal";
import { AttachmentChips } from "./attachment-chips";
import {
  MessageQueue,
  type QueuedPrompt,
} from "./message-queue";
import { AssistantMessage } from "@/components/agent/assistant-message";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
} from "@/components/ai-elements/message";
import { CodePreview } from "@/components/preview/code-preview";
import { streamChatAction } from "@/app/actions/chat";
import { saveProjectEnvAction } from "@/app/actions/env";
import { readStreamableValue } from "@ai-sdk/rsc";
import type { AgentStreamEvent } from "@/lib/agent/events";
import { mergeProjectFiles } from "@/lib/project-files";
import type { ThinkingLevel } from "@/lib/thinking-level";
import {
  parseLucaModelTier,
  readStoredLucaModelTier,
  resolveLucaModelTier,
  type LucaModelTier,
} from "@/lib/luca-model-tier";
import { useAuthModal } from "@/components/auth/auth-context";
import type { PlanId } from "@/lib/billing/plans";
import { thinkingLevelForPlan } from "@/lib/billing/plans";
import type {
  AssistantPart,
  ChatAttachment,
  ChatMessage,
  EnvRequestPart,
  ProjectFile,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChevronDown, PanelRight } from "lucide-react";
import { PanelResizer } from "./panel-resizer";
import {
  CHAT_PANEL_MAX,
  CHAT_PANEL_MIN,
  useChatPanelWidth,
} from "./use-chat-panel-width";
import { useShell } from "./shell-context";
import { previewApiUrl } from "@/lib/preview/client-api-url";

type Props = {
  chatId: string;
  chatTitle?: string;
  initialMessages: ChatMessage[];
  initialFiles: ProjectFile[];
  initialProjectId: string | null;
  initialImageDataUrls?: Record<string, string>;
  initialPackages?: Record<string, string>;
  initialLucaModelTier?: string | null;
  autoStart?: boolean;
};

type LiveState = {
  parts: AssistantPart[];
  projectId: string | null;
  projectFiles: Array<{ path: string; language?: string }>;
};

function emptyLive(): LiveState {
  return { parts: [], projectId: null, projectFiles: [] };
}

function stripEmptyThinking(parts: AssistantPart[]): AssistantPart[] {
  return parts.filter(
    (p) => p.type !== "thinking" || Boolean(p.text?.trim()),
  );
}

/** Keep streamed UI parts; fill in thinking duration from the final done payload. */
function mergeThinkingFromDone(
  liveParts: AssistantPart[],
  doneParts: AssistantPart[] | undefined,
): AssistantPart[] {
  if (!doneParts?.length) return liveParts;
  const doneThink = doneParts.find((p) => p.type === "thinking");
  if (!doneThink) return liveParts;
  const idx = liveParts.findIndex((p) => p.type === "thinking");
  if (idx < 0) return [doneThink, ...liveParts];
  const cur = liveParts[idx];
  if (cur.type !== "thinking") return liveParts;
  const next = [...liveParts];
  next[idx] = {
    type: "thinking",
    text: (cur.text || doneThink.text || "").trim()
      ? [cur.text, doneThink.text].filter(Boolean).join("\n\n")
      : cur.text || doneThink.text || "",
    durationSec:
      cur.durationSec != null ? cur.durationSec : doneThink.durationSec,
  };
  return next;
}

function markPhaseItemsDone(parts: AssistantPart[]): AssistantPart[] {
  return parts.map((p) => {
    if (p.type !== "phase") return p;
    return {
      ...p,
      files: p.files.map((f) =>
        f.status === "in_progress" ? { ...f, status: "done" as const } : f,
      ),
      commands: p.commands.map((c) =>
        c.status === "in_progress" ? { ...c, status: "done" as const } : c,
      ),
    };
  });
}

/** End-of-turn: one thinking line + close in-progress phase rows. */
function sealStreamParts(parts: AssistantPart[]): AssistantPart[] {
  const sealed = markPhaseItemsDone(parts);
  let thinkSec = 0;
  let thinkText = "";
  let hadThink = false;
  const rest: AssistantPart[] = [];
  for (const p of sealed) {
    if (p.type === "thinking") {
      hadThink = true;
      thinkSec += Math.max(0, p.durationSec ?? 0);
      if (p.text?.trim()) {
        thinkText = thinkText
          ? `${thinkText}\n\n${p.text.trim()}`
          : p.text.trim();
      }
      continue;
    }
    rest.push(p);
  }
  if (!hadThink || !thinkText.trim()) return rest;
  return [
    {
      type: "thinking",
      text: thinkText,
      durationSec: Math.max(1, thinkSec || 1),
    },
    ...rest,
  ];
}

function ensurePhasePart(
  parts: AssistantPart[],
  id: string,
  text: string,
): AssistantPart[] {
  const next = [...parts];
  const idx = next.findIndex((p) => p.type === "phase" && p.id === id);
  if (idx >= 0) {
    const cur = next[idx];
    if (cur.type === "phase") {
      next[idx] = { ...cur, text: text || cur.text };
    }
    return next;
  }
  next.push({ type: "phase", id, text, files: [], commands: [] });
  return next;
}

function latestPhaseId(parts: AssistantPart[], prefer?: string): string {
  if (prefer) return prefer;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].type === "phase") return (parts[i] as { id: string }).id;
  }
  return `p-live-${parts.length}`;
}

function applyLiveEvent(prev: LiveState, event: AgentStreamEvent): LiveState {
  switch (event.type) {
    case "thinking": {
      const parts = [...prev.parts];
      const idx = parts.findIndex((p) => p.type === "thinking");
      if (idx >= 0) {
        if (event.durationSec != null) {
          const cur = parts[idx];
          if (cur.type === "thinking") {
            parts[idx] = {
              ...cur,
              durationSec: event.durationSec,
            };
            return { ...prev, parts };
          }
        }
        return prev;
      }
      parts.unshift({
        type: "thinking",
        text: "",
        ...(event.durationSec != null
          ? { durationSec: event.durationSec }
          : {}),
      });
      return { ...prev, parts };
    }
    case "thinking_delta": {
      const parts = [...prev.parts];
      const idx = parts.findIndex((p) => p.type === "thinking");
      if (idx >= 0) {
        const cur = parts[idx];
        if (cur.type === "thinking") {
          parts[idx] = {
            type: "thinking",
            text: cur.text + event.text,
            durationSec: cur.durationSec,
          };
        }
      } else {
        parts.unshift({ type: "thinking", text: event.text });
      }
      return { ...prev, parts };
    }
    case "thinking_done": {
      const parts = [...prev.parts];
      const idx = parts.findIndex((p) => p.type === "thinking");
      const add = Math.max(1, event.durationSec || 1);
      if (idx >= 0) {
        const cur = parts[idx];
        const prevSec =
          cur.type === "thinking" && cur.durationSec != null
            ? cur.durationSec
            : 0;
        parts[idx] = {
          type: "thinking",
          text: cur.type === "thinking" ? cur.text : "",
          durationSec: prevSec + add,
        };
      } else {
        parts.unshift({ type: "thinking", text: "", durationSec: add });
      }
      return { ...prev, parts };
    }
    case "phase":
      return {
        ...prev,
        parts: ensurePhasePart(prev.parts, event.id, event.text),
      };
    case "file": {
      const phaseId = latestPhaseId(prev.parts, event.phaseId);
      let parts = ensurePhasePart(
        prev.parts,
        phaseId,
        "Building project files",
      );
      parts = parts.map((p) => {
        if (p.type !== "phase" || p.id !== phaseId) return p;
        const idx = p.files.findIndex((f) => f.path === event.path);
        const item = {
          path: event.path,
          action: event.action,
          status: event.status,
          language: event.language,
          linesDelta: event.linesDelta,
        };
        const files =
          idx >= 0
            ? p.files.map((f, i) => (i === idx ? { ...f, ...item } : f))
            : [...p.files, item];
        return { ...p, files };
      });
      const projectFiles =
        event.action === "delete" && event.status === "done"
          ? prev.projectFiles.filter((f) => f.path !== event.path)
          : (() => {
              const map = new Map(prev.projectFiles.map((f) => [f.path, f]));
              map.set(event.path, {
                path: event.path,
                language: event.language,
              });
              return [...map.values()];
            })();
      return {
        ...prev,
        projectId: prev.projectId || "project",
        projectFiles,
        parts,
      };
    }
    case "command": {
      const phaseId = latestPhaseId(prev.parts, event.phaseId);
      let parts = ensurePhasePart(prev.parts, phaseId, "Installing packages");
      parts = parts.map((p) => {
        if (p.type !== "phase" || p.id !== phaseId) return p;
        const idx = p.commands.findIndex((c) => c.name === event.name);
        const item = {
          name: event.name,
          status: event.status,
          detail: event.detail,
        };
        const commands =
          idx >= 0
            ? p.commands.map((c, i) => (i === idx ? { ...c, ...item } : c))
            : [...p.commands, item];
        return { ...p, commands };
      });
      return { ...prev, parts };
    }
    case "summary":
      return {
        ...prev,
        parts: [
          ...prev.parts.filter((p) => p.type !== "summary"),
          { type: "summary", lines: event.lines },
        ],
      };
    case "status":
      return {
        ...prev,
        parts: [
          ...prev.parts.filter((p) => p.type !== "status"),
          {
            type: "status",
            action: event.action,
            filesChanged: event.filesChanged,
            linesDelta: event.linesDelta,
          },
        ],
      };
    case "error":
      return {
        ...prev,
        parts: [
          ...prev.parts,
          { type: "error", message: event.message },
        ],
      };
    case "preview":
      return {
        ...prev,
        parts: [
          ...prev.parts.filter((p) => p.type !== "preview"),
          { type: "preview", ready: event.ready },
        ],
      };
    case "text": {
      const parts = [...prev.parts];
      const last = parts[parts.length - 1];
      if (!event.text && last?.type === "text") {
        parts[parts.length - 1] = { type: "text", text: "" };
        return { ...prev, parts };
      }
      parts.push({ type: "text", text: event.text || "" });
      return { ...prev, parts };
    }
    case "text_delta": {
      const parts = [...prev.parts];
      const last = parts[parts.length - 1];
      if (last?.type === "text") {
        parts[parts.length - 1] = {
          type: "text",
          text: last.text + event.text,
        };
        return { ...prev, parts };
      }
      return {
        ...prev,
        parts: [...parts, { type: "text", text: event.text }],
      };
    }
    case "project":
      return { ...prev, projectId: event.id };
    case "delete": {
      const projectFiles = prev.projectFiles.filter((f) => f.path !== event.path);
      return { ...prev, projectFiles };
    }
    case "actions":
      return {
        ...prev,
        parts: [
          ...prev.parts.filter((p) => p.type !== "actions"),
          { type: "actions", actions: event.actions },
        ],
      };
    case "env_request":
      return {
        ...prev,
        parts: [
          ...prev.parts.filter(
            (p) => !(p.type === "env_request" && p.id === event.id),
          ),
          {
            type: "env_request",
            id: event.id,
            title: event.title,
            description: event.description,
            database: event.database,
            vars: event.vars,
            status: "pending",
          },
        ],
      };
    case "chat_image":
      return {
        ...prev,
        parts: [
          ...prev.parts,
          {
            type: "generated_image",
            id: event.id,
            url: event.url,
            dataUrl: event.dataUrl,
            query: event.query,
            kind: event.kind,
            caption: event.caption,
          },
        ],
      };
    case "done": {
      const projectFiles = event.files.map((f) => ({
        path: f.path,
        language: f.language,
      }));
      const merged = mergeThinkingFromDone(
        prev.parts.length ? prev.parts : (event.parts ?? []),
        event.parts,
      );
      return {
        parts: stripEmptyThinking(sealStreamParts(merged)),
        projectId: event.projectId,
        projectFiles,
      };
    }
    default:
      return prev;
  }
}

export function ChatWorkspace({
  chatId,
  chatTitle,
  initialMessages,
  initialFiles,
  initialProjectId,
  initialImageDataUrls = {},
  initialPackages = {},
  initialLucaModelTier,
  autoStart,
}: Props) {
  const { billing } = useAuthModal();
  const planId = (billing?.planId ?? "free") as PlanId;
  const thinkingLevel = useMemo(
    () => thinkingLevelForPlan(planId),
    [planId],
  );
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [files, setFiles] = useState<ProjectFile[]>(initialFiles);
  const [projectId, setProjectId] = useState<string | null>(initialProjectId);
  const [imageDataUrls, setImageDataUrls] =
    useState<Record<string, string>>(initialImageDataUrls);
  const [packages, setPackages] = useState<Record<string, string>>(
    initialPackages,
  );
  const [envModal, setEnvModal] = useState<EnvRequestPart | null>(null);
  const [envSaving, setEnvSaving] = useState(false);
  const openEnvModal = useCallback((part: EnvRequestPart) => {
    setEnvModal(part);
  }, []);
  const [lucaModelTier, setLucaModelTier] = useState<LucaModelTier>(() => {
    const parsed = parseLucaModelTier(initialLucaModelTier);
    return parsed
      ? resolveLucaModelTier(planId, parsed)
      : readStoredLucaModelTier(planId);
  });
  const [live, setLive] = useState<LiveState | null>(null);
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<QueuedPrompt[]>([]);
  const [showPreview, setShowPreview] = useState(initialFiles.length > 0);
  const [mobilePreview, setMobilePreview] = useState(false);
  const startedRef = useRef(false);
  const liveRef = useRef<LiveState | null>(null);
  const lucaModelTierRef = useRef(lucaModelTier);
  const busyRef = useRef(false);
  const queueRef = useRef<QueuedPrompt[]>([]);
  const runGenerationRef = useRef<
    ((opts: {
      message?: string;
      isFirst?: boolean;
      attachments?: ChatAttachment[];
      thinkingLevel?: ThinkingLevel;
      lucaModelTier?: LucaModelTier;
    }) => Promise<void>) | null
  >(null);
  const router = useRouter();
  const { openPlans } = usePlansModal();
  const { setPreviewOpen } = useShell();
  const { width: chatPanelWidth, setWidth: setChatPanelWidth, getWidth } =
    useChatPanelWidth();

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    lucaModelTierRef.current = lucaModelTier;
  }, [lucaModelTier]);

  useEffect(() => {
    setLucaModelTier((prev) => resolveLucaModelTier(planId, prev));
  }, [planId]);

  const hasPreview = files.length > 0 || showPreview;

  const handlePreviewReady = useCallback(() => {
    setMessages((prev) => {
      if (!prev.length) return prev;
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role !== "assistant") continue;
        const parts = [
          ...(next[i].parts ?? []).filter((p) => p.type !== "preview"),
          { type: "preview" as const, ready: true },
        ];
        next[i] = { ...next[i], parts };
        break;
      }
      return next;
    });
  }, []);

  const setLiveState = useCallback((next: LiveState | null) => {
    liveRef.current = next;
    setLive(next);
  }, []);

  const patchLive = useCallback((updater: (prev: LiveState) => LiveState) => {
    const base = liveRef.current ?? emptyLive();
    const next = updater(base);
    liveRef.current = next;
    setLive(next);
  }, []);

  const refreshChat = useCallback(async () => {
    const res = await fetch(`/api/chats/${chatId}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      chat: {
        messages: ChatMessage[];
        files: ProjectFile[];
        projectId: string | null;
        packages?: Record<string, string>;
        imageDataUrls?: Record<string, string>;
      };
    };
    setMessages((prev) => {
      const incoming = data.chat.messages ?? [];
      // Keep local think line if Mongo reply omitted it (race / older saves)
      const lastIn = [...incoming].reverse().find((m) => m.role === "assistant");
      const lastPrev = [...prev].reverse().find((m) => m.role === "assistant");
      const localThink = lastPrev?.parts?.find((p) => p.type === "thinking");

      // Never drop user image/file chips on refresh if the server row is briefly stale
      const prevById = new Map(prev.map((m) => [m.id, m]));
      const merged = incoming.map((m) => {
        const local = prevById.get(m.id);
        let next = m;
        if (
          m.role === "user" &&
          local?.attachments?.length &&
          !(m.attachments?.length)
        ) {
          next = { ...next, attachments: local.attachments };
        }
        if (
          lastIn &&
          localThink &&
          m.id === lastIn.id &&
          !m.parts?.some((p) => p.type === "thinking")
        ) {
          next = { ...next, parts: [localThink, ...(m.parts ?? [])] };
        }
        return next;
      });

      // Keep a just-sent local user bubble (with attachments) if GET is still behind
      const lastPrevUser = [...prev].reverse().find((m) => m.role === "user");
      if (
        lastPrevUser?.id.startsWith("local-") &&
        lastPrevUser.attachments?.length &&
        !merged.some(
          (m) =>
            m.role === "user" &&
            (m.attachments ?? []).some((a) =>
              lastPrevUser.attachments!.some((b) => b.id === a.id),
            ),
        )
      ) {
        const lastMergedUserIdx = [...merged]
          .map((m, i) => ({ m, i }))
          .reverse()
          .find(({ m }) => m.role === "user")?.i;
        if (
          lastMergedUserIdx != null &&
          !(merged[lastMergedUserIdx].attachments?.length)
        ) {
          merged[lastMergedUserIdx] = {
            ...merged[lastMergedUserIdx],
            attachments: lastPrevUser.attachments,
          };
        } else if (lastMergedUserIdx == null) {
          return [...merged, lastPrevUser];
        }
      }

      return merged;
    });
    // Client stream files often arrive before DB save finishes — never wipe
    // fresher local edits with a stale GET (that froze the preview on old code).
    setFiles((prev) =>
      mergeProjectFiles(data.chat.files ?? [], prev),
    );
    setProjectId(data.chat.projectId);
    setPackages((prev) => ({
      ...(data.chat.packages ?? {}),
      ...prev,
    }));
    setImageDataUrls((prev) => ({
      ...(data.chat.imageDataUrls ?? {}),
      ...prev,
    }));
    if ((data.chat.files ?? []).length) setShowPreview(true);
  }, [chatId]);

  useEffect(() => {
    setPreviewOpen(hasPreview);
    return () => setPreviewOpen(false);
  }, [hasPreview, setPreviewOpen]);

  const runGeneration = useCallback(
    async (opts: {
      message?: string;
      isFirst?: boolean;
      attachments?: ChatAttachment[];
      thinkingLevel?: ThinkingLevel;
      lucaModelTier?: LucaModelTier;
    }) => {
      setBusy(true);
      setLiveState(emptyLive());

      if (opts.lucaModelTier) {
        setLucaModelTier(opts.lucaModelTier);
        lucaModelTierRef.current = opts.lucaModelTier;
      }
      const level = thinkingLevel;
      const tier = opts.lucaModelTier ?? lucaModelTierRef.current;

      if ((opts.message || opts.attachments?.length) && !opts.isFirst) {
        setMessages((prev) => [
          ...prev,
          {
            id: `local-${Date.now()}`,
            role: "user",
            content:
              opts.message ||
              (opts.attachments?.length
                ? `Uploaded ${opts.attachments.length} file(s)`
                : ""),
            attachments: opts.attachments,
            createdAt: new Date(),
          },
        ]);
      }

      try {
        // RSC Flight transport (`text/x-component`) via AI SDK streamable value
        const attachmentIds = (opts.attachments ?? []).map((a) => a.id);
        const { events: streamable } = await streamChatAction({
          chatId,
          message:
            opts.message?.trim() ||
            (attachmentIds.length
              ? `Please use the uploaded file${attachmentIds.length > 1 ? "s" : ""}.`
              : ""),
          isFirst: opts.isFirst,
          attachmentIds,
          thinkingLevel: level,
          lucaModelTier: tier,
        });

        for await (const event of readStreamableValue(streamable)) {
          if (!event) continue;
          // RSC keep-alive — ignore (avoids "streamable value slow to update")
          if (event.type === "ping") continue;

          if (event.type === "error") {
            throw new Error(event.message);
          }
          if (event.type === "clone_ref") {
            setMessages((prev) => {
              const next = [...prev];
              for (let i = next.length - 1; i >= 0; i--) {
                if (next[i].role !== "user") continue;
                const existing = next[i].attachments ?? [];
                const merged = [
                  ...existing,
                  ...event.attachments.filter(
                    (a) => !existing.some((e) => e.id === a.id),
                  ),
                ];
                next[i] = { ...next[i], attachments: merged };
                break;
              }
              return next;
            });
            continue;
          }
          if (
            event.type === "file" &&
            event.status === "done" &&
            event.action !== "delete" &&
            typeof event.code === "string"
          ) {
            const code = event.code;
            setShowPreview(true);
            setFiles((prev) =>
              mergeProjectFiles(prev, [
                {
                  path: event.path,
                  code,
                  language: event.language,
                },
              ]),
            );
          }
          if (
            event.type === "file" &&
            event.status === "done" &&
            event.action === "delete"
          ) {
            setFiles((prev) => prev.filter((f) => f.path !== event.path));
          }
          if (event.type === "delete") {
            setFiles((prev) => prev.filter((f) => f.path !== event.path));
          }
          if (event.type === "package") {
            setPackages((prev) => ({
              ...prev,
              [event.name]: event.version,
            }));
          }
          if (event.type === "image" && event.dataUrl) {
            const publicPath = event.path.startsWith("public/")
              ? `/${event.path.slice("public/".length)}`
              : event.path.startsWith("/")
                ? event.path
                : `/${event.path}`;
            setImageDataUrls((prev) => ({
              ...prev,
              [publicPath]: event.dataUrl!,
              [event.path]: event.dataUrl!,
              [event.path.replace(/^public\//, "/")]: event.dataUrl!,
              [`public${publicPath}`]: event.dataUrl!,
            }));
          }
          if (event.type === "env_request") {
            const part: EnvRequestPart = {
              type: "env_request",
              id: event.id,
              title: event.title,
              description: event.description,
              database: event.database,
              vars: event.vars,
              status: "pending",
            };
            // Open modal as soon as Luca asks for secrets
            setEnvModal(part);
          }
          if (event.type === "project") {
            setProjectId(event.id);
          }
          if (event.type === "done") {
            setProjectId(event.projectId);
            if (event.packages) {
              setPackages((prev) => ({ ...prev, ...event.packages }));
            }
            if (event.files.length) {
              setShowPreview(true);
              setFiles((prev) => mergeProjectFiles(prev, event.files));
            }
            patchLive((prev) => applyLiveEvent(prev, event));
            continue;
          }

          patchLive((prev) => applyLiveEvent(prev, event));
          if (
            event.type === "text_delta" ||
            event.type === "thinking_delta" ||
            event.type === "thinking" ||
            event.type === "thinking_done"
          ) {
            await new Promise((r) => setTimeout(r, 0));
          }
        }

        // Commit streamed assistant message, clear live+busy BEFORE refreshChat.
        // Previously: setLive(null) while busy stayed true during await refreshChat()
        // → empty AssistantMessage with isStreaming → stuck "Thinking..." under the reply.
        const snapshot = liveRef.current;
        if (snapshot?.parts.length) {
          const sealed = stripEmptyThinking(sealStreamParts(snapshot.parts));
          const textBits = sealed
            .filter(
              (p): p is Extract<AssistantPart, { type: "text" }> =>
                p.type === "text",
            )
            .map((p) => p.text);
          const summaryBits = sealed
            .filter(
              (p): p is Extract<AssistantPart, { type: "summary" }> =>
                p.type === "summary",
            )
            .flatMap((p) => p.lines);
          const content = [...textBits, ...summaryBits]
            .filter((t) => t.trim())
            .join("\n\n");
          setMessages((prev) => [
            ...prev,
            {
              id: `assistant-${Date.now()}`,
              role: "assistant",
              content,
              parts: sealed,
              createdAt: new Date(),
            },
          ]);
        }
        setLiveState(null);
        setBusy(false);
        // Sync from server in the background — don't block the composer
        void refreshChat();
      } catch (err) {
        const raw = err instanceof Error ? err.message : "Generation failed";
        const msg =
          /\b429\b|resource_exhausted|quota|too many requests|at capacity|busy right now/i.test(
            raw,
          )
            ? "Luca is at capacity right now. Wait about a minute, or try again after midnight UTC."
            : raw.length > 240
              ? `${raw.slice(0, 200)}…`
              : raw;
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content: msg,
            parts: [{ type: "error", message: msg }],
            createdAt: new Date(),
          },
        ]);
        setLiveState(null);
        setBusy(false);
        if (/credit|daily limit|upgrade your plan/i.test(msg)) {
          openPlans();
        }
      } finally {
        setBusy(false);
        setLiveState(null);
        // Drain next queued prompt after this turn finishes
        const next = queueRef.current[0];
        if (next) {
          setQueue((prev) => prev.slice(1));
          void runGenerationRef.current?.({
            message: next.text,
            attachments: next.attachments,
            thinkingLevel: next.thinkingLevel,
            lucaModelTier: next.lucaModelTier,
          });
        }
      }
    },
    [chatId, refreshChat, setLiveState, patchLive, openPlans, thinkingLevel],
  );

  useEffect(() => {
    runGenerationRef.current = runGeneration;
  }, [runGeneration]);

  useEffect(() => {
    if (!autoStart || startedRef.current) return;
    const onlyUser =
      initialMessages.length === 1 && initialMessages[0]?.role === "user";
    if (!onlyUser) return;
    startedRef.current = true;
    router.replace(`/c/${chatId}`);
    void runGeneration({
      isFirst: true,
      message: initialMessages[0].content,
      lucaModelTier: lucaModelTierRef.current,
    });
  }, [autoStart, chatId, initialMessages, router, runGeneration]);

  const enqueuePrompt = useCallback((item: Omit<QueuedPrompt, "id">) => {
    setQueue((prev) => [
      ...prev,
      { ...item, id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
    ]);
  }, []);

  const removeQueued = useCallback((id: string) => {
    setQueue((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const sendQueuedNow = useCallback(
    (id: string) => {
      setQueue((prev) => {
        const item = prev.find((m) => m.id === id);
        if (!item) return prev;
        const rest = prev.filter((m) => m.id !== id);
        // If idle, fire immediately; otherwise move to front
        if (!busyRef.current) {
          void runGeneration({
            message: item.text,
            attachments: item.attachments,
            thinkingLevel: item.thinkingLevel,
            lucaModelTier: item.lucaModelTier,
          });
          return rest;
        }
        return [item, ...rest];
      });
    },
    [runGeneration],
  );

  const onAction = useCallback(
    (name: string) => {
      if (busyRef.current) {
        enqueuePrompt({
          text: name,
          attachments: [],
          thinkingLevel,
          lucaModelTier: lucaModelTierRef.current,
        });
        return;
      }
      void runGeneration({ message: name });
    },
    [enqueuePrompt, runGeneration, thinkingLevel],
  );

  const markEnvSaved = useCallback(
    (requestId: string, savedKeys: string[]) => {
      const patchParts = (parts: AssistantPart[] | undefined) =>
        parts?.map((p) =>
          p.type === "env_request" && p.id === requestId
            ? { ...p, status: "saved" as const, savedKeys }
            : p,
        );

      setMessages((prev) =>
        prev.map((m) =>
          m.role === "assistant" && m.parts?.some(
            (p) => p.type === "env_request" && p.id === requestId,
          )
            ? { ...m, parts: patchParts(m.parts) }
            : m,
        ),
      );
      patchLive((prev) => ({
        ...prev,
        parts: patchParts(prev.parts) ?? prev.parts,
      }));
      setEnvModal((prev) =>
        prev && prev.id === requestId
          ? { ...prev, status: "saved", savedKeys }
          : prev,
      );
    },
    [patchLive],
  );

  const onSaveEnv = useCallback(
    async (values: Record<string, string>) => {
      if (!envModal) return;
      setEnvSaving(true);
      try {
        const result = await saveProjectEnvAction({
          chatId,
          requestId: envModal.id,
          values,
        });
        if (!result.ok || !result.files) {
          throw new Error(result.error || "Failed to save environment");
        }
        setFiles(result.files);
        setShowPreview(true);
        markEnvSaved(envModal.id, result.savedKeys ?? []);
        // Restart preview so Next.js picks up .env.local
        try {
          await fetch(previewApiUrl(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chatId,
              files: result.files,
              imageDataUrls,
              packages,
              restart: true,
            }),
          });
        } catch {
          /* preview may not be open yet */
        }
        setEnvModal(null);
      } catch (err) {
        console.error(err);
        alert(err instanceof Error ? err.message : "Failed to save env");
      } finally {
        setEnvSaving(false);
      }
    },
    [chatId, envModal, imageDataUrls, markEnvSaved, packages],
  );

  const displayMessages = useMemo(() => messages, [messages]);

  const chatColumn = (
    <>
      {chatTitle ? (
        <div className="flex h-11 shrink-0 items-center border-b border-zinc-800 px-4 lg:px-3">
          <button
            type="button"
            className="flex min-w-0 max-w-full items-center gap-1 truncate text-left text-sm font-medium text-zinc-200"
            title={chatTitle}
          >
            <span className="truncate">{chatTitle}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
          </button>
        </div>
      ) : null}
      <Conversation className="relative min-h-0 flex-1">
        <ConversationContent
          className={cn(
            "mx-auto sm:px-4",
            hasPreview ? "max-w-none px-3" : "max-w-3xl",
          )}
        >
          {displayMessages.map((m) => (
            <Message from={m.role} key={m.id}>
              {m.role === "user" ? (
                <>
                  <AttachmentChips attachments={m.attachments} />
                  {m.content ? (
                    <MessageContent>{m.content}</MessageContent>
                  ) : null}
                </>
              ) : (
                <MessageContent>
                  <AssistantMessage
                    content={m.content}
                    parts={m.parts}
                    onAction={onAction}
                    onOpenEnv={openEnvModal}
                    onRetry={() => {
                      const lastUser = [...messages]
                        .reverse()
                        .find((x) => x.role === "user");
                      if (lastUser?.content) {
                        void runGeneration({ message: lastUser.content });
                      }
                    }}
                  />
                </MessageContent>
              )}
            </Message>
          ))}

          {live ? (
            <Message from="assistant">
              <MessageContent>
                <AssistantMessage
                  content=""
                  parts={live.parts}
                  isStreaming={busy}
                  onAction={onAction}
                  onOpenEnv={openEnvModal}
                />
              </MessageContent>
            </Message>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="bg-zinc-950/80 px-3 py-3 sm:px-4">
        <div
          className={cn(
            "mx-auto space-y-2",
            hasPreview ? "max-w-none" : "max-w-3xl",
          )}
        >
          {hasPreview && (
            <button
              type="button"
              onClick={() => setMobilePreview(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-300 lg:hidden"
            >
              <PanelRight className="h-3.5 w-3.5" />
              Open preview
            </button>
          )}
          <MessageQueue
            items={queue}
            onRemove={removeQueued}
            onSendNow={sendQueuedNow}
          />
          <PromptForm
            compact
            initialLucaModelTier={lucaModelTier}
            contextMessages={messages.map((m) => ({
              role: m.role,
              content: m.content,
            }))}
            placeholder={
              busy ? "Add to queue while Luca is working…" : undefined
            }
            onSubmit={async ({
              text,
              attachments,
              lucaModelTier: tier,
            }) => {
              if (busyRef.current) {
                enqueuePrompt({
                  text,
                  attachments,
                  thinkingLevel,
                  lucaModelTier: tier,
                });
                return;
              }
              await runGeneration({
                message: text,
                attachments,
                lucaModelTier: tier,
              });
            }}
          />
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-0 flex-1">
      <section
        className={cn(
          "flex min-h-0 min-w-0 flex-col",
          hasPreview
            ? "w-full shrink-0 lg:w-[var(--chat-panel-w)] lg:border-r lg:border-zinc-800/60"
            : "w-full flex-1",
        )}
        style={
          hasPreview
            ? ({
                "--chat-panel-w": `${chatPanelWidth}px`,
              } as React.CSSProperties)
            : undefined
        }
      >
        {chatColumn}
      </section>

      {hasPreview && (
        <>
          <PanelResizer
            onResize={setChatPanelWidth}
            getWidth={getWidth}
            min={CHAT_PANEL_MIN}
            max={CHAT_PANEL_MAX}
            className="hidden lg:block"
          />
          <section className="hidden min-h-0 min-w-0 flex-1 flex-col lg:flex">
            <CodePreview
              files={files}
              projectId={projectId}
              chatId={chatId}
              imageDataUrls={imageDataUrls}
              packages={packages}
              streaming={busy}
              onFilesChange={setFiles}
              onPreviewReady={handlePreviewReady}
            />
          </section>
        </>
      )}

      {mobilePreview && hasPreview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950 lg:hidden">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <span className="text-sm font-medium">Preview</span>
            <button
              type="button"
              onClick={() => setMobilePreview(false)}
              className="rounded-md border border-zinc-700 px-3 py-1 text-xs"
            >
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <CodePreview
              files={files}
              projectId={projectId}
              chatId={chatId}
              imageDataUrls={imageDataUrls}
              packages={packages}
              streaming={busy}
              onFilesChange={setFiles}
            />
          </div>
        </div>
      )}

      <EnvVarsModal
        open={Boolean(envModal)}
        request={envModal}
        busy={envSaving}
        onClose={() => setEnvModal(null)}
        onSave={onSaveEnv}
      />
    </div>
  );
}

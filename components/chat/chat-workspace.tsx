"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PromptForm } from "./prompt-form";
import { AttachmentChips } from "./attachment-chips";
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
import { readStreamableValue } from "@ai-sdk/rsc";
import type { AgentStreamEvent } from "@/lib/agent/events";
import { mergeProjectFiles } from "@/lib/project-files";
import {
  parseThinkingLevel,
  type ThinkingLevel,
} from "@/lib/thinking-level";
import type {
  AssistantPart,
  ChatAttachment,
  ChatMessage,
  ProjectFile,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { PanelRight } from "lucide-react";
import { useShell } from "./shell-context";

type Props = {
  chatId: string;
  initialMessages: ChatMessage[];
  initialFiles: ProjectFile[];
  initialProjectId: string | null;
  initialImageDataUrls?: Record<string, string>;
  initialPackages?: Record<string, string>;
  initialThinkingLevel?: string | null;
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

/** End-of-turn: seal thinking duration and close in-progress rows. */
function sealStreamParts(parts: AssistantPart[]): AssistantPart[] {
  return markPhaseItemsDone(parts).map((p) =>
    p.type === "thinking" && p.durationSec == null
      ? { ...p, text: "", durationSec: 1 }
      : p.type === "thinking"
        ? { ...p, text: "" }
        : p,
  );
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
    case "thinking":
      return {
        ...prev,
        parts: [
          ...prev.parts,
          {
            type: "thinking",
            text: "",
            ...(event.durationSec != null
              ? { durationSec: event.durationSec }
              : {}),
          },
        ],
      };
    case "thinking_delta":
      // Never render raw reasoning tokens
      return prev;
    case "thinking_done": {
      const parts = [...prev.parts];
      for (let i = parts.length - 1; i >= 0; i--) {
        if (parts[i].type === "thinking") {
          parts[i] = {
            type: "thinking",
            text: "",
            durationSec: event.durationSec,
          };
          break;
        }
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
    case "done": {
      const projectFiles = event.files.map((f) => ({
        path: f.path,
        language: f.language,
      }));
      if (event.parts?.length) {
        return {
          parts: event.parts,
          projectId: event.projectId,
          projectFiles,
        };
      }
      return {
        parts: sealStreamParts(prev.parts),
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
  initialMessages,
  initialFiles,
  initialProjectId,
  initialImageDataUrls = {},
  initialPackages = {},
  initialThinkingLevel,
  autoStart,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [files, setFiles] = useState<ProjectFile[]>(initialFiles);
  const [projectId, setProjectId] = useState<string | null>(initialProjectId);
  const [imageDataUrls, setImageDataUrls] =
    useState<Record<string, string>>(initialImageDataUrls);
  const [packages, setPackages] = useState<Record<string, string>>(
    initialPackages,
  );
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>(() =>
    parseThinkingLevel(initialThinkingLevel, "LOW"),
  );
  const [live, setLive] = useState<LiveState | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(initialFiles.length > 0);
  const [mobilePreview, setMobilePreview] = useState(false);
  const startedRef = useRef(false);
  const liveRef = useRef<LiveState | null>(null);
  const thinkingLevelRef = useRef(thinkingLevel);
  const router = useRouter();
  const { setPreviewOpen } = useShell();

  useEffect(() => {
    thinkingLevelRef.current = thinkingLevel;
  }, [thinkingLevel]);

  const hasPreview = files.length > 0 || showPreview;

  const setLiveState = useCallback((next: LiveState | null) => {
    liveRef.current = next;
    setLive(next);
  }, []);

  const patchLive = useCallback(
    (updater: (prev: LiveState) => LiveState) => {
      setLive((prev) => {
        const base = prev ?? emptyLive();
        const next = updater(base);
        liveRef.current = next;
        return next;
      });
    },
    [],
  );

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
    setMessages(data.chat.messages);
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
    }) => {
      setBusy(true);
      setLiveState(emptyLive());

      if (opts.thinkingLevel) {
        setThinkingLevel(opts.thinkingLevel);
        thinkingLevelRef.current = opts.thinkingLevel;
      }
      const level = opts.thinkingLevel ?? thinkingLevelRef.current;

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
        const { events: streamable } = await streamChatAction({
          chatId,
          message: opts.message ?? "",
          isFirst: opts.isFirst,
          attachmentIds: (opts.attachments ?? []).map((a) => a.id),
          thinkingLevel: level,
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
            patchLive((prev) => {
              const base = prev.parts.length
                ? {
                    ...prev,
                    projectId: event.projectId,
                    projectFiles: event.files.map((f) => ({
                      path: f.path,
                      language: f.language,
                    })),
                  }
                : applyLiveEvent(prev, event);
              return {
                ...base,
                parts: sealStreamParts(base.parts),
              };
            });
            continue;
          }

          patchLive((prev) => applyLiveEvent(prev, event));
          if (
            event.type === "text_delta" ||
            event.type === "thinking_delta"
          ) {
            await new Promise((r) => setTimeout(r, 0));
          }
        }

        // Commit streamed assistant message, clear live+busy BEFORE refreshChat.
        // Previously: setLive(null) while busy stayed true during await refreshChat()
        // → empty AssistantMessage with isStreaming → stuck "Thinking..." under the reply.
        const snapshot = liveRef.current;
        if (snapshot?.parts.length) {
          const sealed = sealStreamParts(snapshot.parts);
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
          /\b429\b|resource_exhausted|quota|too many requests/i.test(raw)
            ? "Gemini quota is exhausted on the available API keys. Wait about a minute (or until daily reset) and try again — or add fresh keys."
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
      } finally {
        setBusy(false);
        setLiveState(null);
      }
    },
    [chatId, refreshChat, setLiveState, patchLive],
  );

  useEffect(() => {
    if (!autoStart || startedRef.current) return;
    const onlyUser =
      initialMessages.length === 1 && initialMessages[0]?.role === "user";
    if (!onlyUser) return;
    startedRef.current = true;
    router.replace(`/c/${chatId}`);
    void runGeneration({ isFirst: true, message: initialMessages[0].content });
  }, [autoStart, chatId, initialMessages, router, runGeneration]);

  const onAction = useCallback(
    (name: string) => {
      if (busy) return;
      void runGeneration({ message: name });
    },
    [busy, runGeneration],
  );

  const displayMessages = useMemo(() => messages, [messages]);

  return (
    <div className="flex min-h-0 flex-1">
      <section
        className={cn(
          "flex min-w-0 flex-col",
          hasPreview ? "w-full lg:w-[46%]" : "w-full",
        )}
      >
        <Conversation className="relative min-h-0 flex-1">
          <ConversationContent className="mx-auto max-w-2xl sm:px-4">
            {displayMessages.map((m) => (
              <Message from={m.role} key={m.id}>
                <MessageContent>
                  {m.role === "user" ? (
                    <>
                      <AttachmentChips attachments={m.attachments} />
                      {m.content ? (
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      ) : null}
                    </>
                  ) : (
                    <AssistantMessage
                      content={m.content}
                      parts={m.parts}
                      onAction={onAction}
                      onRetry={() => {
                        const lastUser = [...messages]
                          .reverse()
                          .find((x) => x.role === "user");
                        if (lastUser?.content) {
                          void runGeneration({ message: lastUser.content });
                        }
                      }}
                    />
                  )}
                </MessageContent>
              </Message>
            ))}

            {/* Only while a live stream exists — never `busy` alone, or refreshChat
                leaves an empty "Thinking..." bubble under the finished reply. */}
            {live ? (
              <Message from="assistant">
                <MessageContent>
                  <AssistantMessage
                    content=""
                    parts={live.parts}
                    isStreaming={busy}
                    onAction={onAction}
                  />
                </MessageContent>
              </Message>
            ) : null}

          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="border-t border-zinc-800/80 bg-zinc-950/80 px-4 py-4 sm:px-8">
          <div className="mx-auto max-w-2xl space-y-2">
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
            <PromptForm
              compact
              disabled={busy}
              initialThinkingLevel={thinkingLevel}
              onSubmit={async ({ text, attachments, thinkingLevel: level }) => {
                await runGeneration({
                  message: text,
                  attachments,
                  thinkingLevel: level,
                });
              }}
            />
          </div>
        </div>
      </section>

      {hasPreview && (
        <section className="hidden min-w-0 border-l border-zinc-800 lg:block lg:w-[54%]">
          <CodePreview
            files={files}
            projectId={projectId}
            chatId={chatId}
            imageDataUrls={imageDataUrls}
            packages={packages}
            streaming={busy}
            onPreviewReady={() => {
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
            }}
          />
        </section>
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
            />
          </div>
        </div>
      )}
    </div>
  );
}

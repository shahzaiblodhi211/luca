"use client";

import { MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { ResponseMarkdown, ASSISTANT_MARKDOWN_CLASS } from "./response-markdown";
import { FileMentionText, doneFilePaths } from "./file-mention-text";
import { ActionChips } from "./action-chips";
import { BuildPhase } from "./build-phase";
import { MessageToolbarActions } from "./message-toolbar-actions";
import { ThinkingLine } from "./thinking-line";
import { sanitizeVisibleReply } from "@/lib/agent/sanitize-visible-reply";
import type { AssistantPart, BuildPhasePart } from "@/lib/types";

/** Turn stored summary lines into a normal chat reply. */
function summaryToMarkdown(lines: string[]) {
  const cleaned = lines.map((l) => l.replace(/^[-*•]\s+/, "").trim()).filter(Boolean);
  if (!cleaned.length) return "";
  const fragments = cleaned.every((l) => l.split(/\s+/).length <= 14);
  if (fragments && cleaned.length > 1) {
    return cleaned.map((l) => l.replace(/[.:]+$/, "")).join(". ") + ".";
  }
  return cleaned.join("\n\n");
}
function hasVisibleContent(parts: AssistantPart[]) {
  return parts.some((p) => {
    if (p.type === "phase") {
      return Boolean(p.text?.trim()) || p.files.length > 0 || p.commands.length > 0;
    }
    if (p.type === "text") return Boolean(p.text?.trim()) || p.text === "";
    if (p.type === "thinking") return Boolean(p.text?.trim());
    if (p.type === "summary") return p.lines.length > 0;
    if (p.type === "error") return Boolean(p.message?.trim());
    if (p.type === "preview") return p.ready;
    if (p.type === "actions") return p.actions.length > 0;
    if (p.type === "env_request") return p.vars.length > 0;
    if (p.type === "generated_image") return Boolean(p.url || p.dataUrl);
    if (p.type === "step") return true;
    if (p.type === "project") return p.files.length > 0;
    return false;
  });
}

type Group =
  | { kind: "thinking"; part: Extract<AssistantPart, { type: "thinking" }> }
  | { kind: "phases"; parts: BuildPhasePart[] }
  | { kind: "text"; text: string }
  | { kind: "summary"; lines: string[] }
  | { kind: "error"; message: string }
  | { kind: "preview" }
  | { kind: "actions"; part: Extract<AssistantPart, { type: "actions" }> }
  | {
      kind: "env_request";
      part: Extract<AssistantPart, { type: "env_request" }>;
    }
  | {
      kind: "generated_image";
      part: Extract<AssistantPart, { type: "generated_image" }>;
    };

function collapsePhases(parts: BuildPhasePart[]): BuildPhasePart[] {
  const order: string[] = [];
  const byKey = new Map<string, BuildPhasePart>();
  for (const phase of parts) {
    const key = phase.files[0]?.path || phase.commands[0]?.name || phase.id;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, phase);
      order.push(key);
      continue;
    }
    const files = [...prev.files];
    for (const file of phase.files) {
      const i = files.findIndex((f) => f.path === file.path);
      if (i < 0) files.push(file);
      else if (file.status === "done" || files[i].status !== "done") {
        files[i] = { ...files[i], ...file };
      }
    }
    const commands = [...prev.commands];
    for (const cmd of phase.commands) {
      const i = commands.findIndex((c) => c.name === cmd.name);
      if (i < 0) commands.push(cmd);
      else if (cmd.status === "done" || commands[i].status !== "done") {
        commands[i] = { ...commands[i], ...cmd };
      }
    }
    byKey.set(key, { ...prev, files, commands });
  }
  return order.map((k) => byKey.get(k)!);
}

function groupParts(parts: AssistantPart[]): Group[] {
  const out: Group[] = [];
  let think: Extract<AssistantPart, { type: "thinking" }> | null = null;
  for (const part of parts) {
    if (part.type === "thinking") {
      const sec = part.durationSec ?? 0;
      if (!think) {
        think = {
          type: "thinking",
          text: part.text || "",
          durationSec: part.durationSec,
        };
      } else {
        const mergedText = [think.text, part.text].filter(Boolean).join("\n\n");
        think = {
          type: "thinking",
          text: mergedText,
          durationSec:
            think.durationSec == null && part.durationSec == null
              ? undefined
              : Math.max(1, (think.durationSec ?? 0) + sec),
        };
      }
    }
  }
  if (think?.text?.trim()) out.push({ kind: "thinking", part: think });

  for (const part of parts) {
    if (part.type === "thinking") continue;
    if (part.type === "phase") {
      const last = out[out.length - 1];
      if (last?.kind === "phases") {
        last.parts.push(part);
      } else {
        out.push({ kind: "phases", parts: [part] });
      }
      continue;
    }
    if (part.type === "summary") {
      out.push({ kind: "summary", lines: part.lines });
      continue;
    }
    if (part.type === "status") continue;
    if (part.type === "error") {
      out.push({ kind: "error", message: part.message });
      continue;
    }
    if (part.type === "preview" && part.ready) {
      out.push({ kind: "preview" });
      continue;
    }
    if (part.type === "text") {
      const cleaned = sanitizeVisibleReply(part.text);
      if (!cleaned.trim() && out[out.length - 1]?.kind !== "text") {
        out.push({ kind: "text", text: "" });
        continue;
      }
      if (!cleaned.trim()) continue;
      out.push({ kind: "text", text: cleaned });
      continue;
    }
    if (part.type === "actions") out.push({ kind: "actions", part });
    if (part.type === "env_request") out.push({ kind: "env_request", part });
    if (part.type === "generated_image") {
      out.push({ kind: "generated_image", part });
    }
  }
  return out;
}

export function AssistantMessage({
  content,
  parts,
  onAction,
  onRetry,
  onOpenEnv,
  isStreaming = false,
}: {
  content: string;
  parts?: AssistantPart[];
  onAction?: (name: string) => void;
  onRetry?: () => void;
  onOpenEnv?: (part: Extract<AssistantPart, { type: "env_request" }>) => void;
  isStreaming?: boolean;
}) {
  if (isStreaming && (!parts?.length || !hasVisibleContent(parts))) {
    return (
      <div className="py-1 text-sm text-muted-foreground">
        <Shimmer className="text-sm" duration={1}>
          Thinking...
        </Shimmer>
      </div>
    );
  }

  if (parts?.length) {
    const groups = groupParts(parts);
    if (!groups.length && isStreaming) {
      return (
        <div className="py-1 text-sm text-muted-foreground">
          <Shimmer className="text-sm" duration={1}>
            Thinking...
          </Shimmer>
        </div>
      );
    }

    const finishedFiles = doneFilePaths(parts);

    const copyText = [
      ...groups
        .filter((g): g is Extract<Group, { kind: "text" }> => g.kind === "text")
        .map((g) => g.text),
      ...groups
        .filter(
          (g): g is Extract<Group, { kind: "summary" }> => g.kind === "summary",
        )
        .flatMap((g) => g.lines),
      content,
    ]
      .filter((t) => t?.trim())
      .join("\n\n");

    return (
      <div className="space-y-3">
        {groups.map((g, i) => {
          if (g.kind === "thinking") {
            if (!g.part.text?.trim() && !isStreaming) return null;
            return (
              <ThinkingLine
                key="thinking"
                text={g.part.text}
                isStreaming={isStreaming}
                thinkingActive={isStreaming && g.part.durationSec == null}
                durationSec={g.part.durationSec}
              />
            );
          }
          if (g.kind === "phases") {
            return (
              <div
                key={`phases-${g.parts[0]?.id ?? i}`}
                className="space-y-0.5 py-0.5"
              >
                {collapsePhases(g.parts).map((phase) => (
                  <BuildPhase key={`phase-${phase.id}`} phase={phase} />
                ))}
              </div>
            );
          }
          if (g.kind === "summary") {
            return (
              <ResponseMarkdown key={`summary-${i}`}>
                {summaryToMarkdown(g.lines)}
              </ResponseMarkdown>
            );
          }
          if (g.kind === "error") {
            return (
              <p
                key={`err-${i}`}
                className="rounded-md border border-rose-900/50 bg-rose-950/30 px-3 py-2 text-sm text-rose-300"
              >
                {g.message}
              </p>
            );
          }
          if (g.kind === "preview") return null;
          if (g.kind === "text") {
            if (!g.text && !isStreaming) return null;
            const hasFileMention =
              /`[^`]+`|(?:app|components|lib|public|styles)\/[\w./-]+\.\w+/.test(
                g.text,
              );
            if (hasFileMention) {
              return (
                <FileMentionText
                  key={`text-${i}`}
                  text={g.text}
                  donePaths={finishedFiles}
                  streaming={isStreaming}
                />
              );
            }
            return (
              <ResponseMarkdown
                key={`text-${i}`}
                isStreaming={isStreaming && i === groups.length - 1}
              >
                {g.text}
              </ResponseMarkdown>
            );
          }
          if (g.kind === "actions") {
            return (
              <ActionChips
                key={`actions-${i}`}
                actions={g.part.actions}
                onAction={onAction}
              />
            );
          }
          if (g.kind === "env_request") {
            const saved = g.part.status === "saved";
            return (
              <div
                key={`env-${g.part.id}`}
                className="rounded-lg border border-border bg-muted/30 px-3.5 py-3"
              >
                <p className="text-sm font-medium text-foreground">
                  {g.part.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {saved
                    ? `Saved ${g.part.savedKeys?.length ?? 0} value(s) to .env.local`
                    : `${g.part.vars.length} environment variable${g.part.vars.length === 1 ? "" : "s"} needed for the backend`}
                  {g.part.database ? ` · ${g.part.database}` : ""}
                </p>
                <button
                  type="button"
                  className="mt-2.5 inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm hover:bg-accent"
                  onClick={() => onOpenEnv?.(g.part)}
                >
                  {saved ? "Edit environment" : "Enter environment variables"}
                </button>
              </div>
            );
          }
          if (g.kind === "generated_image") {
            const src = g.part.dataUrl || g.part.url;
            return (
              <figure
                key={`img-${g.part.id}`}
                className="overflow-hidden rounded-xl border border-border bg-muted/20"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={g.part.caption || g.part.query || "Generated image"}
                  className="max-h-[min(70vh,560px)] w-full object-contain bg-zinc-950"
                />
                {(g.part.caption || g.part.kind) && (
                  <figcaption className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                    {g.part.caption ||
                      (g.part.kind === "logo"
                        ? "Generated logo"
                        : "Generated image")}
                  </figcaption>
                )}
              </figure>
            );
          }
          return null;
        })}
        {!isStreaming ? (
          <MessageToolbarActions content={copyText} onRetry={onRetry} />
        ) : null}
      </div>
    );
  }

  const legacy = content
    .replace(/<\/?Thinking>/gi, "")
    .replace(/<\/?CodeProject[^>]*>/gi, "")
    .replace(/<\/?Actions>/gi, "")
    .replace(/<Action\b[^>]*\/?>/gi, "")
    .replace(/<DeleteFile\b[^>]*\/?>/gi, "")
    .trim();
  const body = legacy || content;
  return (
    <div className="space-y-2">
      <ResponseMarkdown>{body}</ResponseMarkdown>
      {!isStreaming ? (
        <MessageToolbarActions content={body} onRetry={onRetry} />
      ) : null}
    </div>
  );
}

"use client";

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { ResponseMarkdown } from "./response-markdown";
import { ActionChips } from "./action-chips";
import { BuildPhase } from "./build-phase";
import { BuildStatusBar } from "./build-status-bar";
import type { AssistantPart, BuildPhasePart } from "@/lib/types";

function hasVisibleContent(parts: AssistantPart[]) {
  return parts.some((p) => {
    if (p.type === "phase") {
      return Boolean(p.text?.trim()) || p.files.length > 0 || p.commands.length > 0;
    }
    if (p.type === "text") return Boolean(p.text?.trim()) || p.text === "";
    if (p.type === "thinking") return p.durationSec != null || p.text === "";
    if (p.type === "summary") return p.lines.length > 0;
    if (p.type === "status") return p.filesChanged > 0;
    if (p.type === "error") return Boolean(p.message?.trim());
    if (p.type === "preview") return p.ready;
    if (p.type === "actions") return p.actions.length > 0;
    // Legacy
    if (p.type === "step") return true;
    if (p.type === "project") return p.files.length > 0;
    return false;
  });
}

type Group =
  | { kind: "thinking"; part: Extract<AssistantPart, { type: "thinking" }> }
  | { kind: "phase"; part: BuildPhasePart }
  | { kind: "text"; text: string }
  | { kind: "summary"; lines: string[] }
  | { kind: "status"; part: Extract<AssistantPart, { type: "status" }> }
  | { kind: "error"; message: string }
  | { kind: "preview" }
  | { kind: "actions"; part: Extract<AssistantPart, { type: "actions" }> };

function groupParts(parts: AssistantPart[]): Group[] {
  const out: Group[] = [];
  for (const part of parts) {
    if (part.type === "phase") {
      out.push({ kind: "phase", part });
      continue;
    }
    if (part.type === "thinking") {
      out.push({ kind: "thinking", part });
      continue;
    }
    if (part.type === "summary") {
      out.push({ kind: "summary", lines: part.lines });
      continue;
    }
    if (part.type === "status") {
      out.push({ kind: "status", part });
      continue;
    }
    if (part.type === "error") {
      out.push({ kind: "error", message: part.message });
      continue;
    }
    if (part.type === "preview" && part.ready) {
      out.push({ kind: "preview" });
      continue;
    }
    if (part.type === "text") {
      if (!part.text.trim() && out[out.length - 1]?.kind !== "text") {
        out.push({ kind: "text", text: "" });
        continue;
      }
      if (!part.text.trim()) continue;
      const last = out[out.length - 1];
      if (last?.kind === "text") {
        last.text = last.text ? `${last.text}\n\n${part.text}` : part.text;
      } else {
        out.push({ kind: "text", text: part.text });
      }
      continue;
    }
    if (part.type === "actions") out.push({ kind: "actions", part });
    // Drop legacy step/project chrome
  }
  return out;
}

export function AssistantMessage({
  content,
  parts,
  onAction,
  onRetry,
  isStreaming = false,
}: {
  content: string;
  parts?: AssistantPart[];
  onAction?: (name: string) => void;
  onRetry?: () => void;
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

    return (
      <div className="space-y-3">
        {groups.map((g, i) => {
          if (g.kind === "thinking") {
            const streamingThink = isStreaming && g.part.durationSec == null;
            return (
              <Reasoning
                key={`think-${i}`}
                isStreaming={streamingThink}
                duration={g.part.durationSec}
                defaultOpen={false}
                autoClose
              >
                <ReasoningTrigger />
                {/* Never show raw reasoning — duration line only */}
                {g.part.text?.trim() ? (
                  <ReasoningContent>{g.part.text}</ReasoningContent>
                ) : null}
              </Reasoning>
            );
          }
          if (g.kind === "phase") {
            const busy =
              g.part.files.some((f) => f.status === "in_progress") ||
              g.part.commands.some((c) => c.status === "in_progress");
            return (
              <BuildPhase
                key={`phase-${g.part.id}`}
                phase={g.part}
                defaultOpen={busy}
              />
            );
          }
          if (g.kind === "summary") {
            return (
              <ul
                key={`summary-${i}`}
                className="space-y-1 border-l-2 border-zinc-700 pl-3 text-sm text-zinc-300"
              >
                {g.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            );
          }
          if (g.kind === "status") {
            return (
              <BuildStatusBar
                key={`status-${i}`}
                action={g.part.action}
                filesChanged={g.part.filesChanged}
                linesDelta={g.part.linesDelta}
                onRetry={onRetry}
              />
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
          if (g.kind === "preview") {
            return (
              <p
                key={`preview-${i}`}
                className="text-[11px] text-zinc-500"
              >
                Preview ready
              </p>
            );
          }
          if (g.kind === "text") {
            if (!g.text && !isStreaming) return null;
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
          return null;
        })}
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
  return <ResponseMarkdown>{legacy || content}</ResponseMarkdown>;
}

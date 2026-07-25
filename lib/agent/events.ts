import type { AgentAction, AgentFile, AgentState } from "./tools";
import { buildStatusFromState } from "./build-timeline";
import type {
  AssistantPart,
  BuildFileAction,
  BuildItemStatus,
  ChatAttachment,
  ProjectFile,
} from "@/lib/types";

export type AgentStreamEvent =
  /** Open a thinking shell; reasoning streams via thinking_delta. */
  | { type: "thinking"; text: string; durationSec?: number }
  /** @deprecated Not streamed to clients — kept for parse compat */
  | { type: "thinking_delta"; text: string }
  | { type: "thinking_done"; durationSec: number }
  | { type: "project"; id: string }
  /** Narrative sentence before a batch of file/command work. */
  | { type: "phase"; id: string; text: string }
  | {
      type: "file";
      path: string;
      action: BuildFileAction;
      status: BuildItemStatus;
      phaseId?: string;
      language?: string;
      /** Present when status is done (except delete). */
      code?: string;
      linesDelta?: number;
    }
  | {
      type: "image";
      path: string;
      query: string;
      aspect?: string;
      url?: string;
      /** data: URL for live preview injection (not for source files). */
      dataUrl?: string;
      kind?: "photo" | "logo" | "illustration";
    }
  /** Chat-only generated image (show in assistant bubble — not a project asset). */
  | {
      type: "chat_image";
      id: string;
      url: string;
      dataUrl?: string;
      query: string;
      kind?: "photo" | "logo" | "illustration";
      caption?: string;
    }
  /** @deprecated Prefer file action=delete */
  | { type: "delete"; path: string }
  /** Package map sync — also mirrored as command events */
  | { type: "package"; name: string; version: string }
  | {
      type: "command";
      name: string;
      status: BuildItemStatus;
      phaseId?: string;
      detail?: string;
    }
  | { type: "text"; text: string }
  | { type: "text_delta"; text: string }
  | { type: "summary"; lines: string[] }
  | {
      type: "status";
      action: string;
      filesChanged: number;
      linesDelta: number;
    }
  | { type: "preview"; ready: boolean }
  /** @deprecated Prefer phase / file / command */
  | {
      type: "step";
      label: string;
      description?: string;
      status?: "complete" | "active" | "pending";
      icon?: "file" | "image" | "search" | "design" | "package" | "default";
    }
  | { type: "actions"; actions: AgentAction[] }
  | {
      type: "env_request";
      id: string;
      title: string;
      description?: string;
      database?: string;
      vars: import("@/lib/types").EnvVarSpec[];
      /** Written project paths (.env.local / .env.example). */
      paths: string[];
    }
  | {
      type: "clone_ref";
      attachments: ChatAttachment[];
      sourceUrl?: string;
    }
  | {
      type: "done";
      projectId: string;
      content: string;
      files: ProjectFile[];
      images: Array<{
        path: string;
        query: string;
        aspect?: string;
        url?: string;
        dataUrl?: string;
        kind?: "photo" | "logo" | "illustration";
      }>;
      deleted: string[];
      actions: AgentAction[];
      thinking: string[];
      parts?: AssistantPart[];
      packages?: Record<string, string>;
    }
  | { type: "error"; message: string }
  | { type: "ping"; t: number };

export type { AssistantPart };

/** NDJSON line + padding so browsers/proxies flush each event (v0-style live UI). */
export function encodeAgentEvent(event: AgentStreamEvent): string {
  return `${JSON.stringify(event)}${" ".repeat(1024)}\n`;
}

export function parseAgentEventLines(
  buffer: string,
): { events: AgentStreamEvent[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: AgentStreamEvent[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("{")) continue;
    try {
      events.push(JSON.parse(trimmed) as AgentStreamEvent);
    } catch {
      // ignore malformed lines
    }
  }
  return { events, rest };
}

export function agentStateToProjectFiles(state: AgentState): ProjectFile[] {
  return [...state.files.values()]
    .filter((f) => !f.isImage)
    .map((f) => ({
      path: f.path,
      code: f.code,
      language: f.language,
    }));
}

export function agentStateToImageJobs(state: AgentState) {
  return [...state.files.values()]
    .filter((f): f is AgentFile & { isImage: true; query: string } =>
      Boolean(f.isImage && f.query),
    )
    .map((f) => ({
      path: f.path,
      query: f.query!,
      aspect: f.aspect,
      url: f.imageUrl,
      dataUrl: f.imageDataUrl,
      kind: f.imageKind,
    }));
}

export function agentStateToContent(state: AgentState): string {
  const summary = state.timeline.find((p) => p.type === "summary");
  if (summary && summary.type === "summary") {
    return summary.lines.join("\n");
  }
  return state.texts.join("\n\n").trim();
}

export function agentStateToParts(state: AgentState): AssistantPart[] {
  let thinkSec = 0;
  let thinkText = "";
  let hadThink = false;
  const parts: AssistantPart[] = [];

  for (const p of state.timeline) {
    if (p.type === "project" || p.type === "step") continue;
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
    parts.push(p);
  }

  if (!thinkText && state.thinking.length) {
    thinkText = state.thinking.join("\n\n");
    hadThink = true;
  }

  if (hadThink && thinkText.trim()) {
    parts.unshift({
      type: "thinking",
      text: thinkText,
      durationSec: Math.max(1, thinkSec || 1),
    });
  }

  if (state.actions.length && !parts.some((p) => p.type === "actions")) {
    parts.push({ type: "actions", actions: state.actions });
  }

  const status = buildStatusFromState(state);
  if (
    status.filesChanged > 0 &&
    !parts.some((p) => p.type === "status")
  ) {
    parts.push({ type: "status", ...status });
  }

  return parts;
}

export function agentStateToPackages(
  state: AgentState,
): Record<string, string> {
  return Object.fromEntries(state.packages.entries());
}

export function buildDoneEvent(state: AgentState): AgentStreamEvent {
  const parts = agentStateToParts(state);
  return {
    type: "done",
    projectId: state.projectId,
    content: agentStateToContent(state),
    files: agentStateToProjectFiles(state),
    images: agentStateToImageJobs(state),
    deleted: [...state.deleted],
    actions: [...state.actions],
    thinking: [...state.thinking],
    parts,
    packages: agentStateToPackages(state),
  };
}

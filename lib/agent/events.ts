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
  /** Open a duration-only thinking shell (no reasoning text). */
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
  | { type: "image"; path: string; query: string; aspect?: string; url?: string }
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
  const parts: AssistantPart[] = [...state.timeline].filter((p) => {
    // Drop legacy noisy project/step chrome from persisted timeline
    if (p.type === "project") return false;
    if (p.type === "step") return false;
    // Never persist raw reasoning text
    if (p.type === "thinking") {
      return p.durationSec != null;
    }
    return true;
  });

  // Ensure thinking parts never leak model text
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.type === "thinking" && p.text) {
      parts[i] = { type: "thinking", text: "", durationSec: p.durationSec };
    }
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

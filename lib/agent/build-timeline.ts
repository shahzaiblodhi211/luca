import type {
  AssistantPart,
  BuildCommandItem,
  BuildFileAction,
  BuildFileItem,
  BuildPhasePart,
} from "@/lib/types";
import type { AgentState } from "./tools";

export function linesOf(code: string): number {
  if (!code) return 0;
  return code.split("\n").length;
}

export function linesDelta(before: string | undefined, after: string): number {
  return linesOf(after) - linesOf(before || "");
}

/** Find the open phase part (latest) or null. */
export function latestPhase(
  parts: AssistantPart[],
): BuildPhasePart | null {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (p.type === "phase") return p;
  }
  return null;
}

export function ensurePhaseOnTimeline(
  state: AgentState,
  text: string,
): { phaseId: string; created: boolean } {
  if (state.currentPhaseId) {
    const existing = state.timeline.find(
      (p): p is BuildPhasePart =>
        p.type === "phase" && p.id === state.currentPhaseId,
    );
    if (existing) return { phaseId: existing.id, created: false };
  }
  const id = `p${state.phaseSeq++}`;
  state.currentPhaseId = id;
  const part: BuildPhasePart = {
    type: "phase",
    id,
    text: text.trim() || "Building",
    files: [],
    commands: [],
  };
  state.timeline.push(part);
  return { phaseId: id, created: true };
}

export function upsertPhaseFile(
  state: AgentState,
  item: BuildFileItem,
): void {
  const { phaseId } = ensurePhaseOnTimeline(state, "Building project files");
  const phase = state.timeline.find(
    (p): p is BuildPhasePart => p.type === "phase" && p.id === phaseId,
  );
  if (!phase) return;
  const idx = phase.files.findIndex((f) => f.path === item.path);
  if (idx >= 0) phase.files[idx] = { ...phase.files[idx], ...item };
  else phase.files.push(item);
}

export function upsertPhaseCommand(
  state: AgentState,
  item: BuildCommandItem,
): void {
  const { phaseId } = ensurePhaseOnTimeline(state, "Installing packages");
  const phase = state.timeline.find(
    (p): p is BuildPhasePart => p.type === "phase" && p.id === phaseId,
  );
  if (!phase) return;
  const idx = phase.commands.findIndex((c) => c.name === item.name);
  if (idx >= 0) phase.commands[idx] = { ...phase.commands[idx], ...item };
  else phase.commands.push(item);
}

export function startNewPhase(state: AgentState, text: string): string {
  state.currentPhaseId = "";
  const { phaseId } = ensurePhaseOnTimeline(state, text);
  return phaseId;
}

export function inferFileAction(
  existed: boolean,
  action?: BuildFileAction,
): BuildFileAction {
  if (action) return action;
  return existed ? "update" : "create";
}

export function buildStatusFromState(state: AgentState): {
  action: string;
  filesChanged: number;
  linesDelta: number;
} {
  let creates = 0;
  let updates = 0;
  let deletes = 0;
  let lines = 0;
  for (const part of state.timeline) {
    if (part.type !== "phase") continue;
    for (const f of part.files) {
      if (f.status !== "done") continue;
      if (f.action === "create") creates += 1;
      else if (f.action === "update") updates += 1;
      else if (f.action === "delete") deletes += 1;
      lines += f.linesDelta ?? 0;
    }
  }
  const filesChanged = creates + updates + deletes;
  let action = "Updated";
  if (creates && !updates && !deletes) action = "Created";
  else if (deletes && !creates && !updates) action = "Deleted";
  else if (creates && updates) action = "Built";
  return { action, filesChanged, linesDelta: lines };
}

export function summaryLinesFromText(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) =>
      line
        .replace(/^#{1,6}\s+/, "")
        .replace(/^[-*•]\s+/, "")
        .replace(/\*\*/g, "")
        .trim(),
    )
    .filter(Boolean)
    .filter(
      (line) =>
        !/\b(stunning|award-caliber|beautiful|gorgeous|delightful|world-class)\b/i.test(
          line,
        ),
    )
    .slice(0, 8);
}

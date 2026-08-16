import type {
  AssistantPart,
  BuildCommandItem,
  BuildFileAction,
  BuildFileItem,
  BuildPhasePart,
} from "@/lib/types";
import type { AgentState } from "./tools";
import { prettyFileLabel } from "./pretty-file-label";

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
  const prefer =
    state.currentPhaseId ||
    ensurePhaseOnTimeline(state, "Building project files").phaseId;
  state.timeline = placeFileOnPhases(state.timeline, item, prefer);
  const landed = state.timeline.find(
    (p): p is BuildPhasePart =>
      p.type === "phase" && p.files.some((f) => f.path === item.path),
  );
  if (landed) state.currentPhaseId = landed.id;
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

/** One row per file: move/update onto the phase that already has this path. */
export function placeFileOnPhases(
  parts: AssistantPart[],
  item: BuildFileItem,
  preferPhaseId?: string,
): AssistantPart[] {
  const existing = parts.find(
    (p): p is BuildPhasePart =>
      p.type === "phase" && p.files.some((f) => f.path === item.path),
  );
  const targetId = existing?.id || preferPhaseId;
  let foundTarget = false;
  const next: AssistantPart[] = [];
  for (const p of parts) {
    if (p.type !== "phase") {
      next.push(p);
      continue;
    }
    const files = p.files.filter((f) => f.path !== item.path);
    if (p.id === targetId) {
      foundTarget = true;
      next.push({ ...p, files: [...files, item] });
      continue;
    }
    if (files.length || p.commands.length) {
      next.push(files === p.files ? p : { ...p, files });
    }
  }
  if (!foundTarget) {
    next.push({
      type: "phase",
      id: targetId || `p-file-${next.length}`,
      text: "Building project files",
      files: [item],
      commands: [],
    });
  }
  return next;
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

function brandFromProjectId(id: string): string {
  const raw = (id || "").trim();
  if (!raw || raw === "project" || /^[a-zA-Z0-9_-]{18,}$/.test(raw)) {
    return "project";
  }
  return raw
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Always leave a Chronos-style reply after a build if the model skipped `finish`. */
export function ensureBuildSummary(state: AgentState): string[] | null {
  if (state.timeline.some((p) => p.type === "summary" && p.lines.length)) {
    return null;
  }
  const paths = [...state.files.keys()].filter((p) =>
    /\.(tsx|jsx|css)$/i.test(p),
  );
  if (!paths.length) return null;

  const brand = brandFromProjectId(state.projectId);
  const labels = [...new Set(paths.map((p) => prettyFileLabel(p)))].slice(0, 5);
  const list =
    labels.length > 1
      ? `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`
      : labels[0] || "the UI";

  const lines = [
    `Your ${brand} is ready.`,
    `**${brand}** is a Next.js app with Tailwind. I built ${list}.`,
    `Open the preview and try the main controls.`,
  ];
  state.timeline.push({ type: "summary", lines });
  const joined = lines.join("\n\n");
  if (!state.texts.includes(joined)) state.texts.push(joined);
  return lines;
}

export function summaryLinesFromText(text: string): string[] {
  const cleaned = text
    .replace(
      /\b(stunning|award-caliber|beautiful|gorgeous|delightful|world-class)\b/gi,
      "",
    )
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  if (!cleaned) return [];

  return cleaned
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split(/\n/)
        .map((line) => line.replace(/^[-*•]\s+/, "").trim())
        .filter(Boolean)
        .join(" ")
        .replace(/\s{2,}/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .slice(0, 5);
}

import { prettyFileLabel } from "@/lib/agent/pretty-file-label";

/** Tools that mean a visible build batch is starting. */
export const BUILD_NARRATION_TOOLS = new Set([
  "phase",
  "write_file",
  "edit_file",
  "write_image",
  "delete_file",
  "install_package",
]);

export function stepHasBuildWork(calls: { name: string }[]): boolean {
  return calls.some((c) => BUILD_NARRATION_TOOLS.has(c.name));
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

function narrationFromTopic(
  verb: "create" | "update" | "remove" | "install",
  topic: string,
): string {
  const clean = topic.replace(/^the\s+/i, "").trim() || "next part";
  if (verb === "install") {
    return `Let me install ${clean}. I'll add it to the project now.`;
  }
  if (verb === "remove") {
    return `Let me remove the ${clean}. I'll take it out of the project now.`;
  }
  if (verb === "update") {
    return `Let me update the ${clean}. I'll apply that change now.`;
  }
  return `Let me create the ${clean}. I'll write that file now.`;
}

export function narrationFromBuildHint(hint: string): string {
  const raw = hint.replace(/[.]+$/, "").trim();
  const topic = raw
    .replace(/^(Created|Updated|Added|Built|Wrote|Installed|Removed|Deleted|Creating|Updating)\s+/i, "")
    .trim()
    .toLowerCase();
  const verb = /updat/i.test(raw)
    ? "update"
    : /install/i.test(raw)
      ? "install"
      : /(removed|deleted)/i.test(raw)
        ? "remove"
        : "create";
  return narrationFromTopic(verb, topic);
}

export function narrationForToolCall(
  name: string,
  args: Record<string, unknown>,
): string {
  if (name === "phase") {
    const label = String(args.text || "").trim();
    if (label) return narrationFromBuildHint(label);
  }
  if (name === "install_package") {
    const pkg = String(args.name || "packages").trim();
    return narrationFromTopic("install", pkg);
  }
  const path = String(args.path || "").trim();
  const topic = path ? prettyFileLabel(path) : "next files";
  const verb =
    name === "edit_file"
      ? "update"
      : name === "delete_file"
        ? "remove"
        : "create";
  return narrationFromTopic(verb, topic);
}

export function narrationForBuildStep(
  calls: Array<{ name: string; args: Record<string, unknown> }>,
): string {
  const phase = calls.find((c) => c.name === "phase");
  if (phase) return narrationForToolCall(phase.name, phase.args);
  const first = calls.find((c) => BUILD_NARRATION_TOOLS.has(c.name));
  if (first) return narrationForToolCall(first.name, first.args);
  return "Let me keep building. I'll write the next files now.";
}

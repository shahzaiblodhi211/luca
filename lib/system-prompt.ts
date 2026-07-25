import { readFileSync, statSync } from "fs";
import { join } from "path";

let cached: string | null = null;
let cachedMtime = 0;

/**
 * Single source of truth: Prompt.md (tool-calling agent system prompt).
 * Reloads when the file changes so prompt edits apply without restarting Node.
 */
export function getSystemPrompt(): string {
  const promptPath = join(process.cwd(), "Prompt.md");

  try {
    const { mtimeMs } = statSync(promptPath);
    if (cached && mtimeMs === cachedMtime) return cached;
    cachedMtime = mtimeMs;
    cached = readFileSync(promptPath, "utf8").trim();
    if (!cached) throw new Error("Prompt.md is empty");
    return cached;
  } catch (err) {
    console.error("[system-prompt] failed to load Prompt.md", err);
    cached = [
      "You are Luca AI, a tool-calling UI builder by Luca Technology.",
      "Use think, set_project, write_file, generate_image (chat), write_image (project), delete_file, message_user, suggest_actions, finish.",
      "Never invent MDX/CodeProject tags. Prefer Next.js App Router + Tailwind with brand CSS tokens.",
      "Ship Awwwards-level craft — never generic AI dark+cyan bento SaaS templates.",
      "Call finish when done.",
    ].join("\n");
    return cached;
  }
}

/** Alias used by the agent loop — same Prompt.md. */
export function getAgentSystemPrompt(): string {
  return getSystemPrompt();
}

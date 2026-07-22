import { sanitizeGeneratedCode } from "@/lib/agent/sanitize-code";
import type { ProjectFile } from "./types";

export function mergeProjectFiles(
  existing: ProjectFile[],
  incoming: ProjectFile[],
): ProjectFile[] {
  const map = new Map(existing.map((f) => [f.path, f]));
  for (const file of incoming) {
    const path = file.path.replace(/^\/+/, "");
    const code =
      /\.(tsx?|jsx?|css|mjs|cjs)$/i.test(path)
        ? sanitizeGeneratedCode(file.code)
        : file.code;
    map.set(path, { ...file, path, code });
  }
  return Array.from(map.values());
}

export function applyDeletedFiles(
  files: ProjectFile[],
  deleted: string[],
): ProjectFile[] {
  if (!deleted.length) return files;
  const remove = new Set(deleted.map((p) => p.replace(/^\/+/, "")));
  return files.filter((f) => !remove.has(f.path.replace(/^\/+/, "")));
}

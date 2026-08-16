import { existsSync } from "node:fs";
import path from "node:path";

export const PREVIEW_RUNTIME_DIR = path.join(process.cwd(), ".preview-runtime");
export const PREVIEW_WORKSPACES_DIR = path.join(
  process.cwd(),
  ".preview-workspaces",
);

export function sanitizeChatId(chatId: string): string {
  const cleaned = chatId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  if (!cleaned) throw new Error("Invalid chatId");
  return cleaned;
}

export function workspaceDirFor(chatId: string): string {
  return path.join(PREVIEW_WORKSPACES_DIR, sanitizeChatId(chatId));
}

export function workspaceExists(chatId: string): boolean {
  try {
    return existsSync(workspaceDirFor(chatId));
  } catch {
    return false;
  }
}

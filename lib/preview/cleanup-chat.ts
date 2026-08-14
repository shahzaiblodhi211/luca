import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { stopPreviewServer } from "@/lib/preview/server-manager";
import { sanitizeChatId, workspaceDirFor } from "@/lib/preview/paths";

/** Stop preview dev server and delete the on-disk workspace for a chat. */
export async function removePreviewWorkspace(chatId: string): Promise<void> {
  const id = sanitizeChatId(chatId);
  await stopPreviewServer(id);
  const dir = workspaceDirFor(id);
  if (existsSync(dir)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function previewWorkerBase(): string | null {
  const raw = process.env.PREVIEW_WORKER_URL?.trim();
  return raw ? raw.replace(/\/+$/, "") : null;
}

/** Tear down preview workspace locally or via preview worker when configured. */
export async function cleanupChatPreview(chatId: string): Promise<void> {
  const id = chatId.trim();
  if (!id) return;

  const worker = previewWorkerBase();
  if (worker) {
    try {
      await fetch(
        `${worker}/api/preview?chatId=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
    } catch (err) {
      console.error("[cleanupChatPreview] worker DELETE failed", err);
    }
    return;
  }

  try {
    await removePreviewWorkspace(id);
  } catch (err) {
    console.error("[cleanupChatPreview] local cleanup failed", err);
  }
}

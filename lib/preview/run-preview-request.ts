import {
  listPreviewRoutes,
  pickDefaultPreviewRoute,
} from "@/lib/preview/routes";
import { withLock } from "@/lib/preview/mutex";
import {
  ensurePreviewServer,
  getPreviewServer,
} from "@/lib/preview/server-manager";
import { removePreviewWorkspace } from "@/lib/preview/cleanup-chat";
import {
  idlePublicPreviewPayload,
  withPublicPreviewUrl,
} from "@/lib/preview/public-url";
import { workspaceExists } from "@/lib/preview/paths";
import { syncPreviewWorkspace } from "@/lib/preview/workspace";
import type { ProjectFile } from "@/lib/types";

export type PreviewPostBody = {
  chatId?: string;
  files?: ProjectFile[];
  imageDataUrls?: Record<string, string>;
  packages?: Record<string, string>;
  restart?: boolean;
  /** Main Luca app origin (Vercel) for /api/images materialization on the worker. */
  lucaAppOrigin?: string;
};

export async function runPreviewPost(body: PreviewPostBody) {
  const chatId = body.chatId?.trim();
  const files = body.files ?? [];
  if (!chatId) {
    return { status: 400 as const, json: { error: "chatId required" } };
  }
  if (!files.length) {
    return { status: 400 as const, json: { error: "files required" } };
  }

  const result = await withLock(`preview:${chatId}`, async () => {
    const sync = await syncPreviewWorkspace(
      chatId,
      files,
      body.imageDataUrls ?? {},
      body.packages ?? {},
      { lucaAppOrigin: body.lucaAppOrigin },
    );
    const server = await ensurePreviewServer(chatId, {
      restart: Boolean(body.restart) || sync.depsChanged,
    });
    const routes = listPreviewRoutes(files);
    return {
      ...withPublicPreviewUrl(server),
      routes,
      defaultRoute: pickDefaultPreviewRoute(files, routes),
      depsChanged: sync.depsChanged,
    };
  });

  return { status: 200 as const, json: result };
}

export function runPreviewGet(chatId: string | null) {
  if (!chatId) {
    return { status: 400 as const, json: { error: "chatId required" } };
  }
  const info = getPreviewServer(chatId);
  if (!info) {
    if (workspaceExists(chatId)) {
      return { status: 200 as const, json: idlePublicPreviewPayload(chatId) };
    }
    return { status: 200 as const, json: { status: "idle" } };
  }
  return { status: 200 as const, json: withPublicPreviewUrl(info) };
}

export async function runPreviewDelete(chatId: string | null) {
  if (!chatId) {
    return { status: 400 as const, json: { error: "chatId required" } };
  }
  await removePreviewWorkspace(chatId);
  return { status: 200 as const, json: { ok: true } };
}

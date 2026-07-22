import { NextResponse } from "next/server";
import {
  listPreviewRoutes,
  pickDefaultPreviewRoute,
} from "@/lib/preview/routes";
import { withLock } from "@/lib/preview/mutex";
import {
  ensurePreviewServer,
  getPreviewServer,
  stopPreviewServer,
} from "@/lib/preview/server-manager";
import { syncPreviewWorkspace } from "@/lib/preview/workspace";
import type { ProjectFile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Body = {
  chatId?: string;
  files?: ProjectFile[];
  imageDataUrls?: Record<string, string>;
  packages?: Record<string, string>;
  restart?: boolean;
};

export async function GET(req: Request) {
  const chatId = new URL(req.url).searchParams.get("chatId");
  if (!chatId) {
    return NextResponse.json({ error: "chatId required" }, { status: 400 });
  }
  const info = getPreviewServer(chatId);
  if (!info) {
    return NextResponse.json({ status: "idle" });
  }
  return NextResponse.json(info);
}

export async function DELETE(req: Request) {
  const chatId = new URL(req.url).searchParams.get("chatId");
  if (!chatId) {
    return NextResponse.json({ error: "chatId required" }, { status: 400 });
  }
  await stopPreviewServer(chatId);
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const chatId = body.chatId?.trim();
  const files = body.files ?? [];
  if (!chatId) {
    return NextResponse.json({ error: "chatId required" }, { status: 400 });
  }
  if (!files.length) {
    return NextResponse.json({ error: "files required" }, { status: 400 });
  }

  try {
    const result = await withLock(`preview:${chatId}`, async () => {
      const sync = await syncPreviewWorkspace(
        chatId,
        files,
        body.imageDataUrls ?? {},
        body.packages ?? {},
      );
      const server = await ensurePreviewServer(chatId, {
        restart: Boolean(body.restart) || sync.depsChanged,
      });
      const routes = listPreviewRoutes(files);
      return {
        ...server,
        routes,
        defaultRoute: pickDefaultPreviewRoute(files, routes),
        depsChanged: sync.depsChanged,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Preview failed";
    console.error("[preview]", message);
    return NextResponse.json({ error: message, status: "error" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getChat, getChatImageDataUrls } from "@/lib/chats";
import { runPreviewGet, runPreviewPost } from "@/lib/preview/run-preview-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function workerBase(): string | null {
  const raw = process.env.PREVIEW_WORKER_URL?.trim();
  return raw ? raw.replace(/\/+$/, "") : null;
}

function previewBlockedOnHost(): NextResponse | null {
  if (workerBase()) return null;
  if (process.env.VERCEL !== "1") return null;
  return NextResponse.json(
    {
      error: "Preview not configured",
      status: "unconfigured",
    },
    { status: 503 },
  );
}

function lucaAppOriginForPreview(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.VERCEL_URL?.trim();
  if (!raw) return "";
  if (raw.startsWith("http")) return raw.replace(/\/+$/, "");
  return `https://${raw.replace(/\/+$/, "")}`;
}

async function forwardToWorker(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const base = workerBase();
  if (!base) throw new Error("PREVIEW_WORKER_URL not set");
  return fetch(`${base}${path}`, init);
}

/** Warm preview from stored chat files (for project thumbnails). */
export async function POST(req: Request) {
  const blocked = previewBlockedOnHost();
  if (blocked) return blocked;

  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { chatId?: string };
    const chatId = body.chatId?.trim();
    if (!chatId) {
      return NextResponse.json({ error: "chatId required" }, { status: 400 });
    }

    const worker = workerBase();
    if (worker) {
      const getRes = await forwardToWorker(
        `/api/preview?chatId=${encodeURIComponent(chatId)}`,
      );
      const getData = (await getRes.json()) as { url?: string; status?: string };
      if (getData.url) {
        return NextResponse.json(getData, { status: 200 });
      }
    } else {
      const existing = runPreviewGet(chatId);
      if (
        existing.status === 200 &&
        "url" in existing.json &&
        existing.json.url
      ) {
        return NextResponse.json(existing.json, { status: 200 });
      }
    }

    const chat = await getChat(chatId, user.id);
    if (!chat?.files?.length) {
      return NextResponse.json({ error: "No project files" }, { status: 404 });
    }

    const imageDataUrls = await getChatImageDataUrls(chat);
    const payload = {
      chatId,
      files: chat.files,
      packages: chat.packages ?? {},
      imageDataUrls,
      lucaAppOrigin: lucaAppOriginForPreview() || undefined,
    };

    if (worker) {
      const res = await forwardToWorker("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return new NextResponse(await res.text(), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const out = await runPreviewPost(payload);
    return NextResponse.json(out.json, { status: out.status });
  } catch (err) {
    console.error("[preview/warm]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Warm failed" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import {
  runPreviewDelete,
  runPreviewGet,
  runPreviewPost,
} from "@/lib/preview/run-preview-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function workerBase(): string | null {
  const raw = process.env.PREVIEW_WORKER_URL?.trim();
  return raw ? raw.replace(/\/+$/, "") : null;
}

/** Vercel cannot spawn local preview servers — require worker URL in production. */
function previewBlockedOnHost(): NextResponse | null {
  if (workerBase()) return null;
  if (process.env.VERCEL !== "1") return null;
  return NextResponse.json(
    {
      error:
        "Live preview is not configured yet. Add PREVIEW_WORKER_URL (preview.lucaai.app) on Vercel, or use chat/build until preview is wired.",
      status: "unconfigured",
    },
    { status: 503 },
  );
}

async function forwardToWorker(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const base = workerBase();
  if (!base) throw new Error("PREVIEW_WORKER_URL not set");
  return fetch(`${base}${path}`, init);
}

export async function GET(req: Request) {
  const blocked = previewBlockedOnHost();
  if (blocked) return blocked;

  const url = new URL(req.url);
  const chatId = url.searchParams.get("chatId");
  const base = workerBase();
  if (base) {
    const res = await forwardToWorker(
      `/api/preview?chatId=${encodeURIComponent(chatId ?? "")}`,
    );
    return new NextResponse(await res.text(), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  }
  const out = runPreviewGet(chatId);
  return NextResponse.json(out.json, { status: out.status });
}

export async function DELETE(req: Request) {
  const blocked = previewBlockedOnHost();
  if (blocked) return blocked;

  const chatId = new URL(req.url).searchParams.get("chatId");
  const base = workerBase();
  if (base) {
    const res = await forwardToWorker(
      `/api/preview?chatId=${encodeURIComponent(chatId ?? "")}`,
      { method: "DELETE" },
    );
    return new NextResponse(await res.text(), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  }
  const out = await runPreviewDelete(chatId);
  return NextResponse.json(out.json, { status: out.status });
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

export async function POST(req: Request) {
  const blocked = previewBlockedOnHost();
  if (blocked) return blocked;

  const base = workerBase();
  const bodyText = await req.text();
  if (base) {
    let forwardBody = bodyText;
    try {
      const parsed = JSON.parse(bodyText || "{}") as Record<string, unknown>;
      if (!parsed.lucaAppOrigin) {
        const origin = lucaAppOriginForPreview();
        if (origin) parsed.lucaAppOrigin = origin;
      }
      forwardBody = JSON.stringify(parsed);
    } catch {
      /* forward raw */
    }
    const res = await forwardToWorker("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: forwardBody,
    });
    return new NextResponse(await res.text(), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  }
  let body: unknown;
  try {
    body = JSON.parse(bodyText || "{}");
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const out = await runPreviewPost(
      body as Parameters<typeof runPreviewPost>[0],
    );
    return NextResponse.json(out.json, { status: out.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Preview failed";
    console.error("[preview]", message);
    return NextResponse.json(
      { error: message, status: "error" },
      { status: 500 },
    );
  }
}

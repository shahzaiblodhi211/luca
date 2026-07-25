import { NextResponse } from "next/server";
import {
  generateImagenImage,
  type ImageKind,
} from "@/lib/gemini-image";
import {
  getImageByHash,
  hashImageQuery,
  saveImage,
  toDataUrl,
} from "@/lib/image-store";

export const runtime = "nodejs";
export const maxDuration = 120;

function parseKind(raw: string | null | undefined): ImageKind {
  const v = (raw || "").toLowerCase();
  if (v === "logo" || v === "illustration") return v;
  return "photo";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query")?.trim();
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const kind = parseKind(searchParams.get("kind"));
  const aspect = searchParams.get("aspect") || undefined;
  const salt = `${kind}:${aspect || ""}:`;

  try {
    const hash = hashImageQuery(query, salt);
    let stored = await getImageByHash(hash);
    if (!stored) {
      const bytes = await generateImagenImage(query, {
        aspectHint: aspect,
        kind,
      });
      stored = await saveImage({
        query,
        mimeType: bytes.mimeType,
        base64: bytes.base64,
        salt,
      });
    }

    const format = searchParams.get("format");
    if (format === "json") {
      return NextResponse.json({
        id: stored._id,
        url: `/api/images/${stored._id}`,
        dataUrl: toDataUrl(stored),
        mimeType: stored.mimeType,
        query: stored.query,
        kind,
      });
    }

    const buffer = Buffer.from(stored.base64, "base64");
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": stored.mimeType || "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("[generate-image]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Image generation failed" },
      { status: 502 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      query?: string;
      aspect?: string;
      kind?: string;
    };
    const query = body.query?.trim();
    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    const kind = parseKind(body.kind);
    const aspect = body.aspect;
    const salt = `${kind}:${aspect || ""}:`;
    const hash = hashImageQuery(query, salt);
    let stored = await getImageByHash(hash);
    if (!stored) {
      const bytes = await generateImagenImage(query, {
        aspectHint: aspect,
        kind,
      });
      stored = await saveImage({
        query,
        mimeType: bytes.mimeType,
        base64: bytes.base64,
        salt,
      });
    }

    return NextResponse.json({
      id: stored._id,
      url: `/api/images/${stored._id}`,
      dataUrl: toDataUrl(stored),
      mimeType: stored.mimeType,
      query: stored.query,
      kind,
    });
  } catch (err) {
    console.error("[generate-image POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Image generation failed" },
      { status: 502 },
    );
  }
}

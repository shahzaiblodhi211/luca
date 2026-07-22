import { NextResponse } from "next/server";
import {
  extractThemeBlueprint,
  ThemeExtractError,
} from "@/lib/theme-extract";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  let body: { url?: string; timeoutMs?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body. Expected { url: string }" },
      { status: 400 },
    );
  }

  const url = body.url?.trim();
  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  try {
    const theme = await extractThemeBlueprint(url, {
      timeoutMs: body.timeoutMs,
    });
    return NextResponse.json(theme);
  } catch (err) {
    if (err instanceof ThemeExtractError) {
      const status =
        err.code === "INVALID_URL"
          ? 400
          : err.code === "TIMEOUT"
            ? 504
            : 502;
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status },
      );
    }
    console.error("[theme-extract]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Theme extraction failed",
      },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) {
    return NextResponse.json(
      { error: "Pass ?url=https://example.com" },
      { status: 400 },
    );
  }
  return POST(
    new Request(req.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    }),
  );
}

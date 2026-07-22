import { NextResponse } from "next/server";
import {
  extractUrls,
  formatInspectionReport,
  inspectUrl,
  wantsCloneOrInspect,
} from "@/lib/inspect-url";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { url?: string; text?: string };
    const text = body.text?.trim() || body.url?.trim() || "";
    const urls = body.url ? [body.url] : extractUrls(text);
    if (!urls.length) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    const cloneMode = wantsCloneOrInspect(text || urls[0]);
    const report = await inspectUrl(urls[0], cloneMode);
    return NextResponse.json({
      report,
      markdown: formatInspectionReport(report),
    });
  } catch (err) {
    console.error("[inspect-url API]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Inspect failed" },
      { status: 502 },
    );
  }
}

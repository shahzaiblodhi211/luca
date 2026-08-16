import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  extractUrls,
  formatInspectionReport,
  inspectUrl,
  wantsCloneOrInspect,
} from "@/lib/inspect-url";
import { inspectFigma, isFigmaUrl } from "@/lib/figma";
import {
  forceRefreshFigmaToken,
  getFigmaAccessTokenForUser,
} from "@/lib/figma-connection";

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
    if (isFigmaUrl(urls[0])) {
      const session = await getSessionUser();
      const token = session
        ? await getFigmaAccessTokenForUser(session.id)
        : null;
      let planAllowed: boolean | undefined;
      if (session) {
        const { syncUserBilling, consumeFigmaImport } = await import(
          "@/lib/billing/credits"
        );
        const { canUseFigmaForPlan } = await import("@/lib/billing/plans");
        const billing = await syncUserBilling(session.id);
        planAllowed = Boolean(
          billing?.billingExempt ||
            canUseFigmaForPlan(billing?.planId ?? "free"),
        );
        const figma = await inspectFigma(urls[0], token, {
          refreshAccessToken: () => forceRefreshFigmaToken(session.id),
          planAllowed,
          onSuccessfulInspect: () => consumeFigmaImport(session.id),
        });
        return NextResponse.json({
          figma,
          markdown: figma?.brief || "",
        });
      }
      const figma = await inspectFigma(urls[0], token, { planAllowed });
      return NextResponse.json({
        figma,
        markdown: figma?.brief || "",
      });
    }
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

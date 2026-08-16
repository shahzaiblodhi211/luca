import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { findUserById } from "@/lib/auth/users";
import { canUseFigmaForPlan } from "@/lib/billing/plans";
import {
  buildFigmaAuthUrl,
  figmaOAuthRedirectUri,
  isFigmaOAuthConfigured,
  setFigmaOAuthState,
} from "@/lib/figma-oauth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    const next = new URL("/?auth=login", req.url);
    return NextResponse.redirect(next);
  }
  const url = new URL(req.url);
  const rawReturn = url.searchParams.get("return") || "/";
  const returnTo =
    rawReturn.startsWith("/") && !rawReturn.startsWith("//") ? rawReturn : "/";

  if (!isFigmaOAuthConfigured()) {
    const dest = new URL(returnTo, url.origin);
    dest.searchParams.set("figma_error", "not_configured");
    return NextResponse.redirect(dest);
  }

  const doc = await findUserById(user.id);
  const allowed =
    Boolean(doc?.billingExempt) || canUseFigmaForPlan(doc?.planId ?? "free");
  if (!allowed) {
    const dest = new URL(returnTo, url.origin);
    dest.searchParams.set("figma_error", "plan_required");
    return NextResponse.redirect(dest);
  }

  const redirectUri = figmaOAuthRedirectUri(url.origin);
  const state = await setFigmaOAuthState(returnTo, redirectUri);
  return NextResponse.redirect(buildFigmaAuthUrl(state, redirectUri));
}

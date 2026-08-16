import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { saveFigmaConnection } from "@/lib/figma-connection";
import {
  consumeFigmaOAuthState,
  exchangeFigmaCode,
  fetchFigmaMe,
  figmaConnectRedirect,
  figmaOAuthRedirectUri,
} from "@/lib/figma-oauth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getSessionUser();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  const consumed = state ? await consumeFigmaOAuthState(state) : null;
  const returnTo = consumed?.returnTo || "/";
  const redirectUri = consumed?.redirectUri || figmaOAuthRedirectUri(url.origin);

  if (!user) {
    return NextResponse.redirect(figmaConnectRedirect("/", "not_signed_in"));
  }
  if (err) {
    return NextResponse.redirect(
      figmaConnectRedirect(returnTo, "denied"),
    );
  }
  if (!code) {
    return NextResponse.redirect(figmaConnectRedirect(returnTo, "missing_code"));
  }

  try {
    const tokens = await exchangeFigmaCode(code, redirectUri);
    const me = await fetchFigmaMe(tokens.accessToken);
    await saveFigmaConnection(user.id, tokens, me);
    return NextResponse.redirect(figmaConnectRedirect(returnTo));
  } catch (e) {
    console.error("[figma/callback]", e);
    return NextResponse.redirect(
      figmaConnectRedirect(returnTo, "oauth_failed"),
    );
  }
}

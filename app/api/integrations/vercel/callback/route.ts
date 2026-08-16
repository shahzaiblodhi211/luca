import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { saveVercelConnection } from "@/lib/vercel-connection";
import {
  consumeVercelOAuthState,
  exchangeVercelCode,
  exchangeVercelIntegrationCode,
  fetchVercelMe,
  vercelConnectRedirect,
  vercelOAuthRedirectUri,
} from "@/lib/vercel-oauth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getSessionUser();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");
  const installTeamId = url.searchParams.get("teamId") || undefined;

  const consumed = state ? await consumeVercelOAuthState(state) : null;
  const returnTo = consumed?.returnTo || "/";
  const redirectUri =
    consumed?.redirectUri || vercelOAuthRedirectUri(url.origin);

  if (!user) {
    return NextResponse.redirect(vercelConnectRedirect("/", "not_signed_in"));
  }
  if (err) {
    return NextResponse.redirect(vercelConnectRedirect(returnTo, "denied"));
  }
  if (!code) {
    return NextResponse.redirect(vercelConnectRedirect(returnTo, "missing_code"));
  }

  try {
    const tokens =
      consumed?.mode === "integration" || !consumed?.codeVerifier
        ? await exchangeVercelIntegrationCode(code, redirectUri)
        : await exchangeVercelCode(code, redirectUri, consumed.codeVerifier);
    const me = await fetchVercelMe(tokens.accessToken);
    await saveVercelConnection(user.id, {
      accessToken: tokens.accessToken,
      teamId: tokens.teamId || installTeamId,
      username: me.username,
      vercelUserId: me.id,
    });
    return NextResponse.redirect(vercelConnectRedirect(returnTo));
  } catch (e) {
    console.error("[vercel/callback]", e);
    return NextResponse.redirect(vercelConnectRedirect(returnTo, "oauth_failed"));
  }
}

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  buildVercelAuthUrl,
  buildVercelIntegrationInstallUrl,
  isVercelIntegrationConfigured,
  isVercelOAuthConfigured,
  setVercelOAuthState,
  vercelOAuthRedirectUri,
} from "@/lib/vercel-oauth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.redirect(new URL("/?auth=login", req.url));
  }
  const url = new URL(req.url);
  const rawReturn = url.searchParams.get("return") || "/";
  const returnTo =
    rawReturn.startsWith("/") && !rawReturn.startsWith("//") ? rawReturn : "/";

  if (!isVercelOAuthConfigured()) {
    const dest = new URL(returnTo, url.origin);
    dest.searchParams.set("vercel_error", "not_configured");
    return NextResponse.redirect(dest);
  }

  const redirectUri = vercelOAuthRedirectUri(url.origin);
  if (isVercelIntegrationConfigured()) {
    const started = await setVercelOAuthState(
      returnTo,
      redirectUri,
      "integration",
    );
    return NextResponse.redirect(
      buildVercelIntegrationInstallUrl(started.state),
    );
  }

  const started = await setVercelOAuthState(returnTo, redirectUri, "signin");
  return NextResponse.redirect(
    buildVercelAuthUrl({
      state: started.state,
      redirectUri,
      codeChallenge: started.codeChallenge,
      nonce: started.nonce,
    }),
  );
}

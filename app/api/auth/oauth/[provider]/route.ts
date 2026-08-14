import { NextResponse } from "next/server";
import type { OAuthProvider } from "@/lib/auth/types";
import { buildAuthUrl } from "@/lib/auth/oauth/providers";
import {
  isOAuthProviderConfigured,
  oauthErrorRedirect,
  oauthProviderLabel,
  type OAuthMode,
} from "@/lib/auth/oauth/config";
import { setOAuthState } from "@/lib/auth/oauth/state";

export const runtime = "nodejs";

const PROVIDERS = new Set<string>(["google", "github", "apple"]);

function parseProvider(raw: string): OAuthProvider | null {
  if (!PROVIDERS.has(raw)) return null;
  return raw as OAuthProvider;
}

function parseMode(raw: string | null): OAuthMode {
  return raw === "signup" ? "signup" : "login";
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  const { provider: raw } = await ctx.params;
  const provider = parseProvider(raw);
  if (!provider) {
    return NextResponse.redirect(oauthErrorRedirect("unknown_provider"));
  }

  if (!isOAuthProviderConfigured(provider)) {
    return NextResponse.redirect(
      oauthErrorRedirect(
        "not_configured",
        `${oauthProviderLabel(provider)} sign-in is not configured on the server yet.`,
      ),
    );
  }

  const url = new URL(req.url);
  const mode = parseMode(url.searchParams.get("mode"));

  try {
    const state = await setOAuthState(provider, mode);
    const authUrl = buildAuthUrl(provider, state, mode);
    return NextResponse.redirect(authUrl);
  } catch (err) {
    console.error(`[auth/oauth/${provider}]`, err);
    return NextResponse.redirect(oauthErrorRedirect("start_failed"));
  }
}

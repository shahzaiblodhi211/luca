import { NextResponse } from "next/server";
import {
  createSessionToken,
  sendSignInNoticeEmail,
  sendWelcomeEmail,
  setSessionCookie,
  toPublicUser,
} from "@/lib/auth";
import type { OAuthProvider } from "@/lib/auth/types";
import { exchangeOAuthCode } from "@/lib/auth/oauth/providers";
import {
  oauthErrorRedirect,
  oauthSuccessRedirect,
} from "@/lib/auth/oauth/config";
import { consumeOAuthState } from "@/lib/auth/oauth/state";
import { resolveOAuthSignIn } from "@/lib/auth/oauth-users";

export const runtime = "nodejs";

const PROVIDERS = new Set<string>(["google", "github", "apple"]);

function parseProvider(raw: string): OAuthProvider | null {
  if (!PROVIDERS.has(raw)) return null;
  return raw as OAuthProvider;
}

async function finishOAuth(
  provider: OAuthProvider,
  code: string,
  state: string,
  req: Request,
  appleName?: string | null,
): Promise<Response> {
  const mode = await consumeOAuthState(provider, state);
  if (!mode) {
    return NextResponse.redirect(oauthErrorRedirect("invalid_state"));
  }

  try {
    const profile = await exchangeOAuthCode(provider, code, {
      appleName,
    });
    const { user, created } = await resolveOAuthSignIn(profile, mode);
    const publicUser = toPublicUser(user);
    const token = await createSessionToken(publicUser);
    await setSessionCookie(token);

    if (created) {
      sendWelcomeEmail({ email: user.email, name: user.name });
    } else {
      const ipHint =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip")?.trim() ||
        undefined;
      sendSignInNoticeEmail({
        email: user.email,
        name: user.name,
        ipHint,
      });
    }

    return NextResponse.redirect(oauthSuccessRedirect());
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth failed.";
    console.error(`[auth/oauth/${provider}/callback]`, err);
    return NextResponse.redirect(oauthErrorRedirect("oauth_failed", message));
  }
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

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  if (err) {
    return NextResponse.redirect(
      oauthErrorRedirect(
        "provider_denied",
        url.searchParams.get("error_description") || err,
      ),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(oauthErrorRedirect("missing_code"));
  }

  return finishOAuth(provider, code, state, req);
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  const { provider: raw } = await ctx.params;
  const provider = parseProvider(raw);
  if (provider !== "apple") {
    return NextResponse.redirect(oauthErrorRedirect("invalid_method"));
  }

  const form = await req.formData();
  const code = String(form.get("code") || "");
  const state = String(form.get("state") || "");
  const err = String(form.get("error") || "");

  if (err) {
    return NextResponse.redirect(oauthErrorRedirect("provider_denied", err));
  }

  if (!code || !state) {
    return NextResponse.redirect(oauthErrorRedirect("missing_code"));
  }

  let appleName: string | null = null;
  const userRaw = form.get("user");
  if (typeof userRaw === "string" && userRaw.trim()) {
    try {
      const parsed = JSON.parse(userRaw) as {
        name?: { firstName?: string; lastName?: string };
      };
      appleName = [parsed.name?.firstName, parsed.name?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
    } catch {
      /* ignore */
    }
  }

  return finishOAuth("apple", code, state, req, appleName);
}

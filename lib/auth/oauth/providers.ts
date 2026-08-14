import { SignJWT, importPKCS8 } from "jose";
import type { OAuthProvider } from "../types";
import type { OAuthMode } from "./config";
import { oauthRedirectUri } from "./config";
import { normalizeOAuthAvatarUrl } from "../avatar-url";

export type OAuthProfile = {
  provider: OAuthProvider;
  providerUserId: string;
  email: string;
  name: string;
  emailVerified: boolean;
  imageUrl?: string;
};

function trim(s: string | undefined | null): string {
  return String(s ?? "").trim();
}

export function buildGoogleAuthUrl(state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID!.trim();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: oauthRedirectUri("google"),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(
  code: string,
): Promise<OAuthProfile> {
  const clientId = process.env.GOOGLE_CLIENT_ID!.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!.trim();
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: oauthRedirectUri("google"),
      grant_type: "authorization_code",
    }),
  });
  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
  };
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(tokenData.error || "Google token exchange failed.");
  }

  const userRes = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    },
  );
  const user = (await userRes.json()) as {
    sub?: string;
    email?: string;
    name?: string;
    picture?: string;
    email_verified?: boolean;
  };
  if (!userRes.ok || !user.sub || !user.email) {
    throw new Error("Could not read Google profile.");
  }

  return {
    provider: "google",
    providerUserId: user.sub,
    email: user.email.toLowerCase(),
    name: trim(user.name) || user.email.split("@")[0] || "Luca user",
    emailVerified: Boolean(user.email_verified),
    imageUrl: normalizeOAuthAvatarUrl(user.picture),
  };
}

export function buildGitHubAuthUrl(state: string): string {
  const clientId = process.env.GITHUB_CLIENT_ID!.trim();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: oauthRedirectUri("github"),
    scope: "read:user user:email",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

export async function exchangeGitHubCode(
  code: string,
): Promise<OAuthProfile> {
  const clientId = process.env.GITHUB_CLIENT_ID!.trim();
  const clientSecret = process.env.GITHUB_CLIENT_SECRET!.trim();
  const tokenRes = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: oauthRedirectUri("github"),
      }),
    },
  );
  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(
      tokenData.error_description || tokenData.error || "GitHub token failed.",
    );
  }

  const headers = {
    Authorization: `Bearer ${tokenData.access_token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "Luca-AI",
  };

  const userRes = await fetch("https://api.github.com/user", { headers });
  const user = (await userRes.json()) as {
    id?: number;
    login?: string;
    name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  };
  if (!userRes.ok || user.id == null) {
    throw new Error("Could not read GitHub profile.");
  }

  let email = trim(user.email).toLowerCase();
  if (!email) {
    const emailsRes = await fetch("https://api.github.com/user/emails", {
      headers,
    });
    const emails = (await emailsRes.json()) as Array<{
      email?: string;
      primary?: boolean;
      verified?: boolean;
    }>;
    const primary =
      emails.find((e) => e.primary && e.verified) ||
      emails.find((e) => e.verified) ||
      emails[0];
    email = trim(primary?.email).toLowerCase();
  }
  if (!email) {
    throw new Error(
      "GitHub did not share an email. Make your email visible or use email sign-in.",
    );
  }

  return {
    provider: "github",
    providerUserId: String(user.id),
    email,
    name: trim(user.name) || trim(user.login) || "Luca user",
    emailVerified: true,
    imageUrl: normalizeOAuthAvatarUrl(user.avatar_url),
  };
}

function applePrivateKeyPem(): string {
  const raw = process.env.APPLE_PRIVATE_KEY!.trim();
  if (raw.includes("BEGIN PRIVATE KEY")) return raw;
  return raw.replace(/\\n/g, "\n");
}

let appleSecretCache: { token: string; exp: number } | null = null;

async function appleClientSecret(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (appleSecretCache && appleSecretCache.exp > now + 60) {
    return appleSecretCache.token;
  }
  const teamId = process.env.APPLE_TEAM_ID!.trim();
  const clientId = process.env.APPLE_CLIENT_ID!.trim();
  const keyId = process.env.APPLE_KEY_ID!.trim();
  const key = await importPKCS8(applePrivateKeyPem(), "ES256");
  const exp = now + 86400 * 180;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience("https://appleid.apple.com")
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(key);
  appleSecretCache = { token, exp };
  return token;
}

export function buildAppleAuthUrl(state: string, mode: OAuthMode): string {
  const clientId = process.env.APPLE_CLIENT_ID!.trim();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: oauthRedirectUri("apple"),
    response_type: "code",
    response_mode: "form_post",
    scope: "name email",
    state,
  });
  if (mode === "signup") {
    params.set("prompt", "consent");
  }
  return `https://appleid.apple.com/auth/authorize?${params}`;
}

export async function exchangeAppleCode(
  code: string,
  nameFromApple?: string | null,
): Promise<OAuthProfile> {
  const clientId = process.env.APPLE_CLIENT_ID!.trim();
  const clientSecret = await appleClientSecret();
  const tokenRes = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: oauthRedirectUri("apple"),
    }),
  });
  const tokenData = (await tokenRes.json()) as {
    id_token?: string;
    error?: string;
  };
  if (!tokenRes.ok || !tokenData.id_token) {
    throw new Error(tokenData.error || "Apple token exchange failed.");
  }

  const [, payloadB64] = tokenData.id_token.split(".");
  if (!payloadB64) throw new Error("Invalid Apple id_token.");
  const payload = JSON.parse(
    Buffer.from(payloadB64, "base64url").toString("utf8"),
  ) as {
    sub?: string;
    email?: string;
    email_verified?: string | boolean;
  };
  if (!payload.sub) throw new Error("Apple profile missing subject.");

  const email = trim(payload.email).toLowerCase();
  if (!email) {
    throw new Error(
      "Apple did not share an email. Use email sign-in or try again with email sharing enabled.",
    );
  }

  return {
    provider: "apple",
    providerUserId: payload.sub,
    email,
    name: trim(nameFromApple) || email.split("@")[0] || "Luca user",
    emailVerified:
      payload.email_verified === true || payload.email_verified === "true",
  };
}

export function buildAuthUrl(
  provider: OAuthProvider,
  state: string,
  mode: OAuthMode,
): string {
  switch (provider) {
    case "google":
      return buildGoogleAuthUrl(state);
    case "github":
      return buildGitHubAuthUrl(state);
    case "apple":
      return buildAppleAuthUrl(state, mode);
  }
}

export async function exchangeOAuthCode(
  provider: OAuthProvider,
  code: string,
  extras?: { appleName?: string | null },
): Promise<OAuthProfile> {
  switch (provider) {
    case "google":
      return exchangeGoogleCode(code);
    case "github":
      return exchangeGitHubCode(code);
    case "apple":
      return exchangeAppleCode(code, extras?.appleName);
  }
}

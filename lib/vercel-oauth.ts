import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { appBaseUrl } from "@/lib/auth/app-url";

const STATE_COOKIE = "luca_vercel_oauth";
const RETURN_COOKIE = "luca_vercel_return";
const MAX_AGE = 600;
const CALLBACK_PATH = "/api/integrations/vercel/callback";

export function isVercelOAuthConfigured(): boolean {
  return Boolean(
    process.env.VERCEL_CLIENT_ID?.trim() &&
      process.env.VERCEL_CLIENT_SECRET?.trim(),
  );
}

/** Integration Console app — can create projects and deploy. */
export function vercelIntegrationSlug(): string | null {
  const slug = process.env.VERCEL_INTEGRATION_SLUG?.trim();
  return slug || null;
}

export function isVercelIntegrationConfigured(): boolean {
  return Boolean(isVercelOAuthConfigured() && vercelIntegrationSlug());
}

export function vercelOAuthRedirectUri(origin?: string): string {
  const override = process.env.VERCEL_REDIRECT_URI?.trim();
  if (override) return override.replace(/\/$/, "");
  const base = (origin || appBaseUrl()).replace(/\/$/, "");
  return `${base}${CALLBACK_PATH}`;
}

function sign(payload: string): string {
  const s = process.env.AUTH_SECRET?.trim();
  if (!s) throw new Error("AUTH_SECRET is required for Vercel OAuth.");
  return createHash("sha256").update(`${s}:vercel:${payload}`).digest("base64url");
}

export async function setVercelOAuthState(
  returnTo: string,
  redirectUri: string,
  mode: "integration" | "signin" = "signin",
): Promise<{ state: string; codeChallenge: string; nonce: string }> {
  const state = randomBytes(24).toString("hex");
  const nonce = randomBytes(24).toString("hex");
  const codeVerifier = randomBytes(43).toString("hex");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  const encoded = Buffer.from(
    JSON.stringify({
      state,
      redirectUri,
      codeVerifier: mode === "signin" ? codeVerifier : undefined,
      nonce,
      mode,
    }),
  ).toString("base64url");
  const token = `${encoded}.${sign(encoded)}`;
  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";
  jar.set(STATE_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  const dest =
    returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  jar.set(RETURN_COOKIE, dest, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  return { state, codeChallenge, nonce };
}

export async function consumeVercelOAuthState(
  stateFromQuery: string,
): Promise<{
  returnTo: string;
  redirectUri: string;
  codeVerifier?: string;
  mode: "integration" | "signin";
} | null> {
  const jar = await cookies();
  const token = jar.get(STATE_COOKIE)?.value;
  const returnTo = jar.get(RETURN_COOKIE)?.value || "/";
  jar.delete(STATE_COOKIE);
  jar.delete(RETURN_COOKIE);
  if (!token) return null;
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig || sign(encoded) !== sig) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as {
      state?: string;
      redirectUri?: string;
      codeVerifier?: string;
      mode?: "integration" | "signin";
    };
    if (parsed.state !== stateFromQuery) return null;
    const mode = parsed.mode === "integration" ? "integration" : "signin";
    if (mode === "signin" && !parsed.codeVerifier) return null;
    return {
      returnTo,
      redirectUri: parsed.redirectUri || vercelOAuthRedirectUri(),
      codeVerifier: parsed.codeVerifier,
      mode,
    };
  } catch {
    return null;
  }
}

export function buildVercelAuthUrl(opts: {
  state: string;
  redirectUri: string;
  codeChallenge: string;
  nonce: string;
}): string {
  const params = new URLSearchParams({
    client_id: process.env.VERCEL_CLIENT_ID!.trim(),
    redirect_uri: opts.redirectUri,
    state: opts.state,
    nonce: opts.nonce,
    response_type: "code",
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
    scope: "openid email profile offline_access",
  });
  return `https://vercel.com/oauth/authorize?${params}`;
}

export function buildVercelIntegrationInstallUrl(state: string): string {
  const slug = vercelIntegrationSlug();
  if (!slug) throw new Error("VERCEL_INTEGRATION_SLUG is not set.");
  return `https://vercel.com/integrations/${encodeURIComponent(slug)}/new?state=${encodeURIComponent(state)}`;
}

function oauthErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const d = data as Record<string, unknown>;
  if (typeof d.error_description === "string" && d.error_description.trim()) {
    return d.error_description;
  }
  if (typeof d.error === "string" && d.error.trim()) return d.error;
  if (d.error && typeof d.error === "object") {
    const inner = d.error as Record<string, unknown>;
    if (typeof inner.message === "string" && inner.message.trim()) {
      return inner.message;
    }
  }
  try {
    return JSON.stringify(data);
  } catch {
    return fallback;
  }
}

async function parseTokenResponse(res: Response) {
  const data = (await res.json()) as {
    access_token?: string;
    token?: string;
    team_id?: string;
    error?: unknown;
    error_description?: string;
  };
  const accessToken = data.access_token || data.token;
  if (!res.ok || !accessToken) {
    throw new Error(oauthErrorMessage(data, "Vercel token exchange failed."));
  }
  return { accessToken, teamId: data.team_id };
}

/** Integration Console — long-lived token that can create projects. */
export async function exchangeVercelIntegrationCode(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; teamId?: string }> {
  const res = await fetch("https://api.vercel.com/v2/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.VERCEL_CLIENT_ID!.trim(),
      client_secret: process.env.VERCEL_CLIENT_SECRET!.trim(),
      code,
      redirect_uri: redirectUri,
    }),
  });
  return parseTokenResponse(res);
}

export async function exchangeVercelCode(
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<{ accessToken: string; teamId?: string }> {
  const res = await fetch("https://api.vercel.com/login/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.VERCEL_CLIENT_ID!.trim(),
      client_secret: process.env.VERCEL_CLIENT_SECRET!.trim(),
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    }),
  });
  return parseTokenResponse(res);
}

export async function fetchVercelMe(accessToken: string): Promise<{
  id?: string;
  username?: string;
}> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const infoRes = await fetch("https://api.vercel.com/login/oauth/userinfo", {
    headers,
    cache: "no-store",
  });
  if (infoRes.ok) {
    const info = (await infoRes.json()) as {
      sub?: string;
      preferred_username?: string;
      name?: string;
    };
    return {
      id: info.sub,
      username: info.preferred_username || info.name,
    };
  }
  const res = await fetch("https://api.vercel.com/v2/user", {
    headers,
    cache: "no-store",
  });
  if (!res.ok) return {};
  const data = (await res.json()) as {
    user?: { id?: string; username?: string };
    id?: string;
    username?: string;
  };
  return {
    id: data.user?.id || data.id,
    username: data.user?.username || data.username,
  };
}

export function vercelConnectRedirect(path: string, error?: string): string {
  const base = appBaseUrl().replace(/\/$/, "");
  const dest = path.startsWith("/") ? path : "/";
  const url = new URL(dest, `${base}/`);
  if (error) url.searchParams.set("vercel_error", error);
  else url.searchParams.set("vercel", "connected");
  return url.toString();
}

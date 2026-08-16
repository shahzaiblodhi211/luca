import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { appBaseUrl } from "@/lib/auth/app-url";

const STATE_COOKIE = "luca_figma_oauth";
const RETURN_COOKIE = "luca_figma_return";
const MAX_AGE = 600;

/** Must be a subset of scopes enabled on the Figma app (My apps → OAuth scopes). */
function figmaOAuthScopes(): string {
  const fromEnv = process.env.FIGMA_OAUTH_SCOPES?.trim();
  if (fromEnv) {
    return fromEnv.split(/[,\s]+/).filter(Boolean).join(",");
  }
  return "file_content:read,file_metadata:read,current_user:read";
}

export function isFigmaOAuthConfigured(): boolean {
  return Boolean(
    process.env.FIGMA_CLIENT_ID?.trim() &&
      process.env.FIGMA_CLIENT_SECRET?.trim(),
  );
}

const CALLBACK_PATH = "/api/integrations/figma/callback";

export function figmaOAuthRedirectUri(origin?: string): string {
  const override = process.env.FIGMA_REDIRECT_URI?.trim();
  if (override) return override.replace(/\/$/, "");
  const base = (origin || appBaseUrl()).replace(/\/$/, "");
  return `${base}${CALLBACK_PATH}`;
}

function basicAuth(): string {
  const id = process.env.FIGMA_CLIENT_ID!.trim();
  const secret = process.env.FIGMA_CLIENT_SECRET!.trim();
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

function sign(payload: string): string {
  const s = process.env.AUTH_SECRET?.trim();
  if (!s) throw new Error("AUTH_SECRET is required for Figma OAuth.");
  return createHash("sha256").update(`${s}:${payload}`).digest("base64url");
}

export async function setFigmaOAuthState(
  returnTo: string,
  redirectUri: string,
): Promise<string> {
  const state = randomBytes(24).toString("hex");
  const encoded = Buffer.from(
    JSON.stringify({ state, redirectUri }),
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
  return state;
}

export async function consumeFigmaOAuthState(
  stateFromQuery: string,
): Promise<{ returnTo: string; redirectUri: string } | null> {
  const jar = await cookies();
  const token = jar.get(STATE_COOKIE)?.value;
  const returnTo = jar.get(RETURN_COOKIE)?.value || "/";
  jar.set(STATE_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  jar.set(RETURN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  if (!token || !stateFromQuery) return null;

  const [encoded, sig] = token.split(".");
  if (!encoded || !sig || sign(encoded) !== sig) return null;

  try {
    const body = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as { state?: string; redirectUri?: string };
    if (body.state !== stateFromQuery) return null;
    return {
      returnTo: returnTo.startsWith("/") ? returnTo : "/",
      redirectUri: body.redirectUri || figmaOAuthRedirectUri(),
    };
  } catch {
    return null;
  }
}

export function buildFigmaAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.FIGMA_CLIENT_ID!.trim(),
    redirect_uri: redirectUri,
    scope: figmaOAuthScopes(),
    state,
    response_type: "code",
  });
  return `https://www.figma.com/oauth?${params}`;
}

export type FigmaTokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  figmaUserId?: string;
};

export async function exchangeFigmaCode(
  code: string,
  redirectUri: string,
): Promise<FigmaTokenSet> {
  const res = await fetch("https://api.figma.com/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: basicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      redirect_uri: redirectUri,
      code,
      grant_type: "authorization_code",
    }),
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    user_id?: number | string;
    error?: string;
    message?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.message || data.error || "Figma token exchange failed.");
  }
  const expiresAt =
    typeof data.expires_in === "number"
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    figmaUserId: data.user_id != null ? String(data.user_id) : undefined,
  };
}

export async function refreshFigmaToken(
  refreshToken: string,
): Promise<FigmaTokenSet> {
  const res = await fetch("https://api.figma.com/v1/oauth/refresh", {
    method: "POST",
    headers: {
      Authorization: basicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
    }),
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    message?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.message || data.error || "Figma token refresh failed.");
  }
  const expiresAt =
    typeof data.expires_in === "number"
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt,
  };
}

export async function fetchFigmaMe(accessToken: string): Promise<{
  handle?: string;
  email?: string;
  id?: string;
}> {
  const res = await fetch("https://api.figma.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return {};
  const me = (await res.json()) as {
    id?: string | number;
    handle?: string;
    email?: string;
  };
  return {
    id: me.id != null ? String(me.id) : undefined,
    handle: me.handle,
    email: me.email,
  };
}

export function figmaConnectRedirect(path: string, error?: string): string {
  const base = appBaseUrl().replace(/\/$/, "");
  const dest = path.startsWith("/") ? path : "/";
  const url = new URL(dest, `${base}/`);
  if (error) url.searchParams.set("figma_error", error);
  else url.searchParams.set("figma", "connected");
  return url.toString();
}

import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import type { OAuthMode } from "./config";
import type { OAuthProvider } from "../types";

const COOKIE = "luca_oauth_state";
const MAX_AGE = 600;

type OAuthStatePayload = {
  state: string;
  provider: OAuthProvider;
  mode: OAuthMode;
};

function secret(): string {
  const s = process.env.AUTH_SECRET?.trim();
  if (!s) throw new Error("AUTH_SECRET is required for OAuth.");
  return s;
}

function sign(payload: string): string {
  return createHash("sha256")
    .update(`${secret()}:${payload}`)
    .digest("base64url");
}

export async function setOAuthState(
  provider: OAuthProvider,
  mode: OAuthMode,
): Promise<string> {
  const state = randomBytes(24).toString("hex");
  const body: OAuthStatePayload = { state, provider, mode };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  const token = `${encoded}.${sign(encoded)}`;
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  return state;
}

export async function consumeOAuthState(
  provider: OAuthProvider,
  stateFromQuery: string,
): Promise<OAuthMode | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  jar.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  if (!token || !stateFromQuery) return null;

  const [encoded, sig] = token.split(".");
  if (!encoded || !sig || sign(encoded) !== sig) return null;

  let body: OAuthStatePayload;
  try {
    body = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as OAuthStatePayload;
  } catch {
    return null;
  }

  if (body.state !== stateFromQuery || body.provider !== provider) return null;
  return body.mode;
}

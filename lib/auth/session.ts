import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { PublicUser, SessionPayload } from "./types";
import { findUserById, toPublicUser } from "./users";

export const SESSION_COOKIE = "luca_session";
const SESSION_DAYS = 30;

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Add a long random string to .env.local.",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(
  user: PublicUser,
): Promise<string> {
  const payload: SessionPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
  };
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const sub = String(payload.sub || "");
    const email = String(payload.email || "");
    const name = String(payload.name || "");
    if (!sub || !email) return null;
    return { sub, email, name };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getSessionUser(): Promise<PublicUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload) return null;
  const user = await findUserById(payload.sub);
  if (!user) return null;
  return toPublicUser(user);
}

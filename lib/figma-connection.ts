import type { FigmaConnection } from "@/lib/auth/types";
import { findUserById, getUsersCollection } from "@/lib/auth/users";
import { openSecret, sealSecret } from "@/lib/auth/secret-box";
import {
  refreshFigmaToken,
  type FigmaTokenSet,
} from "@/lib/figma-oauth";

export async function saveFigmaConnection(
  userId: string,
  tokens: FigmaTokenSet,
  profile: { handle?: string; email?: string; id?: string },
): Promise<void> {
  const col = await getUsersCollection();
  const conn: FigmaConnection = {
    accessTokenEnc: sealSecret(tokens.accessToken),
    ...(tokens.refreshToken
      ? { refreshTokenEnc: sealSecret(tokens.refreshToken) }
      : {}),
    ...(tokens.expiresAt ? { expiresAt: tokens.expiresAt } : {}),
    figmaUserId: profile.id || tokens.figmaUserId,
    handle: profile.handle,
    email: profile.email,
    connectedAt: new Date(),
  };
  await col.updateOne(
    { _id: userId },
    { $set: { figma: conn, updatedAt: new Date() } },
  );
}

export async function clearFigmaConnection(userId: string): Promise<void> {
  const col = await getUsersCollection();
  await col.updateOne(
    { _id: userId },
    { $unset: { figma: "" }, $set: { updatedAt: new Date() } },
  );
}

/** Live access token for the signed-in user, refreshing if needed. */
export async function getFigmaAccessTokenForUser(
  userId: string,
): Promise<string | null> {
  const user = await findUserById(userId);
  const conn = user?.figma;
  if (!conn?.accessTokenEnc) return null;

  const exp = conn.expiresAt ? new Date(conn.expiresAt).getTime() : 0;
  const stale = exp > 0 && exp < Date.now() + 60_000;

  if (!stale) {
    try {
      return openSecret(conn.accessTokenEnc);
    } catch {
      return null;
    }
  }

  if (!conn.refreshTokenEnc) {
    try {
      return openSecret(conn.accessTokenEnc);
    } catch {
      return null;
    }
  }

  try {
    const refresh = openSecret(conn.refreshTokenEnc);
    const next = await refreshFigmaToken(refresh);
    await saveFigmaConnection(userId, next, {
      handle: conn.handle,
      email: conn.email,
      id: conn.figmaUserId,
    });
    return next.accessToken;
  } catch (err) {
    console.warn("[figma] refresh failed", err);
    try {
      return openSecret(conn.accessTokenEnc);
    } catch {
      return null;
    }
  }
}

/** Force a refresh — used when the API returns Invalid token. */
export async function forceRefreshFigmaToken(
  userId: string,
): Promise<string | null> {
  const user = await findUserById(userId);
  const conn = user?.figma;
  if (!conn?.refreshTokenEnc) return null;
  try {
    const refresh = openSecret(conn.refreshTokenEnc);
    const next = await refreshFigmaToken(refresh);
    await saveFigmaConnection(userId, next, {
      handle: conn.handle,
      email: conn.email,
      id: conn.figmaUserId,
    });
    console.info("[figma] access token refreshed");
    return next.accessToken;
  } catch (err) {
    console.warn("[figma] force refresh failed", err);
    return null;
  }
}

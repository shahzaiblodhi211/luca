import type { VercelConnection } from "@/lib/auth/types";
import { findUserById, getUsersCollection } from "@/lib/auth/users";
import { openSecret, sealSecret } from "@/lib/auth/secret-box";

export async function saveVercelConnection(
  userId: string,
  input: { accessToken: string; teamId?: string; username?: string; vercelUserId?: string },
): Promise<void> {
  const col = await getUsersCollection();
  const conn: VercelConnection = {
    accessTokenEnc: sealSecret(input.accessToken.trim()),
    ...(input.teamId?.trim() ? { teamId: input.teamId.trim() } : {}),
    ...(input.username ? { username: input.username } : {}),
    ...(input.vercelUserId ? { vercelUserId: input.vercelUserId } : {}),
    connectedAt: new Date(),
  };
  await col.updateOne(
    { _id: userId },
    { $set: { vercel: conn, updatedAt: new Date() } },
  );
}

export async function clearVercelConnection(userId: string): Promise<void> {
  const col = await getUsersCollection();
  await col.updateOne(
    { _id: userId },
    { $unset: { vercel: "" }, $set: { updatedAt: new Date() } },
  );
}

export async function getVercelAuthForUser(
  userId: string,
): Promise<{ token: string; teamId?: string } | null> {
  const user = await findUserById(userId);
  const conn = user?.vercel;
  if (!conn?.accessTokenEnc) return null;
  try {
    return {
      token: openSecret(conn.accessTokenEnc),
      ...(conn.teamId ? { teamId: conn.teamId } : {}),
    };
  } catch {
    return null;
  }
}

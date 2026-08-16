import { nanoid } from "nanoid";
import type { Collection } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { PasswordResetDoc, PublicUser, UserDoc } from "./types";
import { defaultBillingFields } from "@/lib/billing/credits";
import { hashPassword, normalizeEmail } from "./password";

declare global {
  // eslint-disable-next-line no-var
  var _mongoUsersIndexPromise: Promise<void> | undefined;
  // eslint-disable-next-line no-var
  var _mongoResetIndexPromise: Promise<void> | undefined;
}

export async function getUsersCollection(): Promise<Collection<UserDoc>> {
  const db = await getDb();
  const col = db.collection<UserDoc>("users");
  if (!global._mongoUsersIndexPromise) {
    global._mongoUsersIndexPromise = col
      .createIndex({ email: 1 }, { unique: true })
      .then(() => undefined)
      .catch((err) => {
        global._mongoUsersIndexPromise = undefined;
        console.warn("[mongodb] users index ensure failed:", err);
      });
  }
  return col;
}

export async function getPasswordResetsCollection(): Promise<
  Collection<PasswordResetDoc>
> {
  const db = await getDb();
  const col = db.collection<PasswordResetDoc>("password_resets");
  if (!global._mongoResetIndexPromise) {
    global._mongoResetIndexPromise = Promise.all([
      col.createIndex({ tokenHash: 1 }, { unique: true }),
      col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ])
      .then(() => undefined)
      .catch((err) => {
        global._mongoResetIndexPromise = undefined;
        console.warn("[mongodb] password_resets index ensure failed:", err);
      });
  }
  return col;
}

export function toPublicUser(user: UserDoc): PublicUser {
  return {
    id: user._id,
    email: user.email,
    name: user.name,
    ...(user.imageUrl ? { imageUrl: user.imageUrl } : {}),
    figmaConnected: Boolean(user.figma?.accessTokenEnc),
    ...(user.figma?.handle ? { figmaHandle: user.figma.handle } : {}),
    vercelConnected: Boolean(user.vercel?.accessTokenEnc),
    ...(user.vercel?.username
      ? { vercelUsername: user.vercel.username }
      : {}),
  };
}

export async function findUserByEmail(
  email: string,
): Promise<UserDoc | null> {
  const col = await getUsersCollection();
  return col.findOne({ email: normalizeEmail(email) });
}

export async function findUserById(id: string): Promise<UserDoc | null> {
  const col = await getUsersCollection();
  return col.findOne({ _id: id });
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
}): Promise<UserDoc> {
  const col = await getUsersCollection();
  const now = new Date();
  const doc: UserDoc = {
    _id: nanoid(),
    email: normalizeEmail(input.email),
    name: input.name.trim(),
    passwordHash: await hashPassword(input.password),
    ...defaultBillingFields(now),
    createdAt: now,
    updatedAt: now,
  };
  await col.insertOne(doc);
  return doc;
}

export async function updateUserPassword(
  userId: string,
  password: string,
): Promise<void> {
  const col = await getUsersCollection();
  await col.updateOne(
    { _id: userId },
    {
      $set: {
        passwordHash: await hashPassword(password),
        updatedAt: new Date(),
      },
    },
  );
}

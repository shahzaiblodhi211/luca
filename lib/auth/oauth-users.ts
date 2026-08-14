import { nanoid } from "nanoid";
import type { OAuthProvider, UserDoc } from "./types";
import { defaultBillingFields } from "@/lib/billing/credits";
import { normalizeEmail, isValidEmail } from "./password";
import {
  findUserByEmail,
  findUserById,
  getUsersCollection,
} from "./users";
import type { OAuthProfile } from "./oauth/providers";
import type { OAuthMode } from "./oauth/config";

export async function findUserByOAuthProvider(
  provider: OAuthProvider,
  providerUserId: string,
): Promise<UserDoc | null> {
  const col = await getUsersCollection();
  return col.findOne({
    [`oauth.${provider}`]: providerUserId,
  } as Record<string, string>);
}

function oauthProfileFields(profile: OAuthProfile): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    [`oauth.${profile.provider}`]: profile.providerUserId,
    updatedAt: new Date(),
  };
  if (profile.imageUrl) {
    fields.imageUrl = profile.imageUrl;
  }
  if (profile.name.trim().length >= 2) {
    fields.name = profile.name.trim();
  }
  return fields;
}

export async function resolveOAuthSignIn(
  profile: OAuthProfile,
  mode: OAuthMode,
): Promise<{ user: UserDoc; created: boolean }> {
  if (!isValidEmail(profile.email)) {
    throw new Error("OAuth provider returned an invalid email.");
  }

  const col = await getUsersCollection();
  const email = normalizeEmail(profile.email);

  const byProvider = await findUserByOAuthProvider(
    profile.provider,
    profile.providerUserId,
  );
  if (byProvider) {
    await col.updateOne({ _id: byProvider._id }, { $set: oauthProfileFields(profile) });
    const updated = await findUserById(byProvider._id);
    if (!updated) throw new Error("User update failed.");
    return { user: updated, created: false };
  }

  const byEmail = await findUserByEmail(email);
  if (byEmail) {
    const existingId = byEmail.oauth?.[profile.provider];
    if (existingId && existingId !== profile.providerUserId) {
      throw new Error(
        "This email is linked to a different account for this provider.",
      );
    }
    const setFields = oauthProfileFields(profile);
    if (byEmail.name.trim().length >= 2) {
      delete setFields.name;
    }
    await col.updateOne({ _id: byEmail._id }, { $set: setFields });
    const updated = await findUserById(byEmail._id);
    if (!updated) throw new Error("User update failed.");
    return { user: updated, created: false };
  }

  if (mode === "login") {
    throw new Error(
      "No Luca account for this sign-in. Choose Sign up first or use email.",
    );
  }

  const now = new Date();
  const doc: UserDoc = {
    _id: nanoid(),
    email,
    name: profile.name.trim() || email.split("@")[0] || "Luca user",
    oauth: { [profile.provider]: profile.providerUserId },
    ...(profile.imageUrl ? { imageUrl: profile.imageUrl } : {}),
    ...defaultBillingFields(now),
    createdAt: now,
    updatedAt: now,
  };
  await col.insertOne(doc);
  return { user: doc, created: true };
}

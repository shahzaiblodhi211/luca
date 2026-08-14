import { createHash, randomBytes, randomInt } from "crypto";
import { nanoid } from "nanoid";
import {
  getPasswordResetsCollection,
  findUserByEmail,
  updateUserPassword,
} from "./users";
import { validatePassword, normalizeEmail } from "./password";
import { appBaseUrl } from "./app-url";
import {
  emailTransportConfigured,
  passwordResetEmail,
  sendEmail,
} from "@/lib/email";

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const RESET_CODE_TTL_MIN = 60;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateShortCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

export { appBaseUrl } from "./app-url";

/** Always returns ok (no email enumeration). Includes resetUrl in non-production. */
export async function requestPasswordReset(email: string): Promise<{
  ok: true;
  resetUrl?: string;
  shortCode?: string;
}> {
  const user = await findUserByEmail(email);
  if (!user) {
    return { ok: true };
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const shortCode = generateShortCode();
  const codeHash = hashToken(shortCode);
  const col = await getPasswordResetsCollection();
  const now = new Date();

  await col.updateMany(
    { userId: user._id, usedAt: { $exists: false } },
    { $set: { usedAt: now } },
  );

  await col.insertOne({
    _id: nanoid(),
    userId: user._id,
    tokenHash,
    codeHash,
    expiresAt: new Date(now.getTime() + RESET_TTL_MS),
    createdAt: now,
  });

  const resetUrl = `${appBaseUrl()}/reset-password?token=${rawToken}`;
  const mail = passwordResetEmail({
    name: user.name,
    resetUrl,
    shortCode,
    expiresMinutes: RESET_CODE_TTL_MIN,
  });

  if (emailTransportConfigured()) {
    const sent = await sendEmail({
      to: user.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      replyTo: "info@lucaai.app",
    });
    if (!sent.ok) {
      console.error("[auth] Password reset email failed:", sent.error);
    }
  } else {
    console.info(
      `[auth] Password reset for ${user.email} — link: ${resetUrl} code: ${shortCode}`,
    );
  }

  const devExtras =
    process.env.NODE_ENV === "production"
      ? {}
      : { resetUrl, shortCode };

  return { ok: true, ...devExtras };
}

export async function resetPasswordWithToken(
  token: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const pwErr = validatePassword(password);
  if (pwErr) return { ok: false, error: pwErr };

  const tokenHash = hashToken(token);
  const col = await getPasswordResetsCollection();
  const doc = await col.findOne({ tokenHash });
  if (!doc || doc.usedAt || doc.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "This reset link is invalid or has expired." };
  }

  await finishReset(doc._id, doc.userId, password);
  return { ok: true };
}

export async function verifyPasswordResetCode(
  email: string,
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await findUserByEmail(normalizeEmail(email));
  if (!user) {
    return { ok: false, error: "Invalid code or email." };
  }

  const normalized = code.replace(/\D/g, "").trim();
  if (normalized.length !== 6) {
    return { ok: false, error: "Enter the 6-digit code from your email." };
  }

  const codeHash = hashToken(normalized);
  const col = await getPasswordResetsCollection();
  const doc = await col.findOne({
    userId: user._id,
    codeHash,
    usedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  });

  if (!doc) {
    return { ok: false, error: "Invalid or expired code." };
  }

  return { ok: true };
}

export async function resetPasswordWithCode(
  email: string,
  code: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const pwErr = validatePassword(password);
  if (pwErr) return { ok: false, error: pwErr };

  const user = await findUserByEmail(normalizeEmail(email));
  if (!user) {
    return { ok: false, error: "Invalid code or email." };
  }

  const normalized = code.replace(/\D/g, "").trim();
  if (normalized.length !== 6) {
    return { ok: false, error: "Enter the 6-digit code from your email." };
  }

  const codeHash = hashToken(normalized);
  const col = await getPasswordResetsCollection();
  const doc = await col.findOne({
    userId: user._id,
    codeHash,
    usedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  });

  if (!doc) {
    return { ok: false, error: "Invalid or expired code." };
  }

  await finishReset(doc._id, doc.userId, password);
  return { ok: true };
}

async function finishReset(
  resetId: string,
  userId: string,
  password: string,
): Promise<void> {
  await updateUserPassword(userId, password);
  const col = await getPasswordResetsCollection();
  await col.updateOne({ _id: resetId }, { $set: { usedAt: new Date() } });
}

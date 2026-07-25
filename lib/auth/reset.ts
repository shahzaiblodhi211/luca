import { createHash, randomBytes } from "crypto";
import { nanoid } from "nanoid";
import {
  getPasswordResetsCollection,
  findUserByEmail,
  updateUserPassword,
} from "./users";
import { validatePassword } from "./password";

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function appBaseUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (process.env.VERCEL_URL)
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

/** Always returns ok (no email enumeration). Includes resetUrl in non-production. */
export async function requestPasswordReset(email: string): Promise<{
  ok: true;
  resetUrl?: string;
}> {
  const user = await findUserByEmail(email);
  if (!user) {
    return { ok: true };
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const col = await getPasswordResetsCollection();
  const now = new Date();

  // Invalidate previous unused tokens for this user
  await col.updateMany(
    { userId: user._id, usedAt: { $exists: false } },
    { $set: { usedAt: now } },
  );

  await col.insertOne({
    _id: nanoid(),
    userId: user._id,
    tokenHash,
    expiresAt: new Date(now.getTime() + RESET_TTL_MS),
    createdAt: now,
  });

  const resetUrl = `${appBaseUrl()}/reset-password?token=${rawToken}`;

  // Optional Resend — otherwise log for local testing
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.AUTH_EMAIL_FROM?.trim() || "Luca AI <onboarding@resend.dev>";
  if (resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [user.email],
          subject: "Reset your Luca password",
          html: [
            `<p>Hi ${user.name},</p>`,
            `<p>Reset your Luca password with this link (expires in 1 hour):</p>`,
            `<p><a href="${resetUrl}">${resetUrl}</a></p>`,
            `<p>If you didn't ask for this, you can ignore this email.</p>`,
          ].join(""),
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("[auth] Resend failed:", res.status, body.slice(0, 300));
      }
    } catch (err) {
      console.error("[auth] Resend error:", err);
    }
  } else {
    console.info(`[auth] Password reset link for ${user.email}: ${resetUrl}`);
  }

  return process.env.NODE_ENV === "production"
    ? { ok: true }
    : { ok: true, resetUrl };
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

  await updateUserPassword(doc.userId, password);
  await col.updateOne(
    { _id: doc._id },
    { $set: { usedAt: new Date() } },
  );
  return { ok: true };
}

import nodemailer from "nodemailer";
import {
  emailFromHeader,
  parseEmailFrom,
  resendConfigured,
  smtpConfigured,
  smtpOptions,
} from "./config";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

export type SendEmailResult =
  | { ok: true; transport: "smtp" | "resend" }
  | { ok: false; error: string };

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport(smtpOptions());
  }
  return transporter;
}

async function sendViaSmtp(input: SendEmailInput): Promise<SendEmailResult> {
  const from = emailFromHeader();
  const replyTo =
    input.replyTo?.trim() ||
    process.env.AUTH_EMAIL_REPLY_TO?.trim() ||
    parseEmailFrom(process.env.AUTH_EMAIL_FROM).address;

  try {
    await getTransporter().sendMail({
      from,
      to: input.to,
      replyTo,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    return { ok: true, transport: "smtp" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "SMTP send failed";
    console.error("[email] SMTP error:", message);
    return { ok: false, error: message };
  }
}

async function sendViaResend(input: SendEmailInput): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY!.trim();
  const from = emailFromHeader();
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        reply_to: input.replyTo || process.env.AUTH_EMAIL_REPLY_TO?.trim(),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Resend ${res.status}: ${body.slice(0, 200)}`,
      };
    }
    return { ok: true, transport: "resend" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Resend failed",
    };
  }
}

/** Prefer Zoho SMTP; fall back to Resend if configured. */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (smtpConfigured()) {
    const out = await sendViaSmtp(input);
    if (out.ok) return out;
    if (resendConfigured()) {
      console.warn("[email] SMTP failed, trying Resend");
      return sendViaResend(input);
    }
    return out;
  }
  if (resendConfigured()) {
    return sendViaResend(input);
  }
  return { ok: false, error: "Email not configured (set SMTP_* or RESEND_API_KEY)" };
}

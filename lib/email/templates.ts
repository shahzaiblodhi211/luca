import { appBaseUrl } from "@/lib/auth/app-url";

const SUPPORT_EMAIL = "info@lucaai.app";
const BRAND_GREEN = "#359e74";
const TEXT = "#444444";
const HEADING = "#111111";
const LINK = "#2563eb";

const FONT = "Arial, Helvetica, sans-serif";
const FONT_SEMI =
  "'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const SEMI = `font-family:${FONT_SEMI};font-weight:600;font-style:normal;`;

/** Inline styles Gmail respects (avoid 400 — use normal). */
const P =
  "margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:normal;font-style:normal;line-height:1.6;color:#444444;";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatExpiryFromNow(minutes: number): string {
  const until = new Date(Date.now() + minutes * 60_000);
  return until.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function layout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Luca</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:${FONT};font-weight:normal;color:${TEXT};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
    <tr>
      <td align="left" style="padding:12px 12px 32px 0;font-family:${FONT};font-weight:normal;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
          <tr>
            <td align="left" style="font-family:${FONT};font-weight:normal;font-size:15px;line-height:1.6;color:${TEXT};">
              ${content}
            </td>
          </tr>
          <tr>
            <td align="left" style="padding-top:28px;font-family:${FONT};font-weight:normal;">
              <div style="height:3px;width:96px;background:${BRAND_GREEN};border-radius:2px;font-size:0;line-height:0;">&nbsp;</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function greeting(name: string): string {
  const safe = escapeHtml(name.trim() || "there");
  return `<p style="${P}">Hi <span style="${SEMI}font-size:18px;color:${HEADING};">${safe}</span> !</p>`;
}

function heading(text: string): string {
  return `<p style="margin:0 0 18px;${SEMI}font-size:22px;line-height:1.35;color:${HEADING};letter-spacing:-0.01em;">${escapeHtml(text)}</p>`;
}

function paragraph(html: string): string {
  return `<p style="${P}"><span style="font-family:${FONT};font-size:15px;font-weight:normal;font-style:normal;color:${TEXT};">${html}</span></p>`;
}

function otpCode(code: string): string {
  return `<p style="margin:4px 0 20px;font-family:${FONT};font-size:38px;font-weight:normal;font-style:normal;line-height:1.15;letter-spacing:0.06em;color:${HEADING};">${escapeHtml(code)}</p>`;
}

function primaryButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 24px;">
  <tr>
    <td align="left" bgcolor="${BRAND_GREEN}" style="background-color:${BRAND_GREEN};border-radius:6px;">
      <a href="${href}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 28px;font-family:${FONT};font-size:15px;font-weight:normal;color:#ffffff;text-decoration:none;border-radius:6px;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
}

function signOff(): string {
  return `<p style="${P}">Regards,<br /><span style="font-family:${FONT};font-weight:normal;color:${TEXT};">luca Team</span></p>`;
}

export function passwordResetEmail(input: {
  name: string;
  resetUrl: string;
  shortCode: string;
  expiresMinutes: number;
}): { subject: string; html: string; text: string } {
  const expiryLabel = formatExpiryFromNow(input.expiresMinutes);
  const linkExpiryLabel = formatExpiryFromNow(input.expiresMinutes);
  const subject = "Reset password for your Luca account";

  const html = layout(
    `
      ${greeting(input.name)}
      ${heading("Reset password for your Luca account")}
      ${paragraph(
        `We received a request to reset your Luca account password. Please use the following one-time password to verify yourself. This OTP is valid for ${input.expiresMinutes} minutes till ${escapeHtml(expiryLabel)}.`,
      )}
      ${otpCode(input.shortCode)}
      ${paragraph(
        `If the OTP expires, click the button below to reset your password. The link is valid for ${input.expiresMinutes} minutes till ${escapeHtml(linkExpiryLabel)}.`,
      )}
      ${primaryButton(input.resetUrl, "Reset Password")}
      ${paragraph(
        `If you did not initiate this action, contact <a href="mailto:${SUPPORT_EMAIL}" style="color:${LINK};font-weight:normal;text-decoration:underline;">${SUPPORT_EMAIL}</a>. Your password will not be changed without verification.`,
      )}
      ${signOff()}
    `,
  );

  const text = [
    `Hi ${input.name} !`,
    ``,
    `Reset password for your Luca account`,
    ``,
    `Your one-time password: ${input.shortCode}`,
    `(Valid for ${input.expiresMinutes} minutes till ${expiryLabel}.)`,
    ``,
    `Reset link (valid till ${linkExpiryLabel}):`,
    input.resetUrl,
    ``,
    `If you didn't initiate this, contact ${SUPPORT_EMAIL}.`,
    ``,
    `Regards,`,
    `luca Team`,
  ].join("\n");

  return { subject, html, text };
}

export function welcomeEmail(input: { name: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const signInUrl = `${appBaseUrl()}/?auth=login`;
  const subject = "Welcome to Luca AI";

  const html = layout(
    `
      ${greeting(input.name)}
      ${heading("Welcome to Luca AI")}
      ${paragraph(
        "Your Luca account is ready. Sign in to build apps with AI, edit code, and run live Next.js previews.",
      )}
      ${primaryButton(signInUrl, "Sign in to Luca")}
      ${paragraph(
        `Questions? Email <a href="mailto:${SUPPORT_EMAIL}" style="color:${LINK};font-weight:normal;text-decoration:underline;">${SUPPORT_EMAIL}</a>.`,
      )}
      ${signOff()}
    `,
  );

  const text = [
    `Hi ${input.name} !`,
    ``,
    `Welcome to Luca AI`,
    ``,
    `Sign in: ${signInUrl}`,
    ``,
    `Questions? ${SUPPORT_EMAIL}`,
    ``,
    `Regards,`,
    `luca Team`,
  ].join("\n");

  return { subject, html, text };
}

export function signInNoticeEmail(input: {
  name: string;
  when: string;
  ipHint?: string;
}): { subject: string; html: string; text: string } {
  const subject = "New sign-in to your Luca account";
  const ipBlock = input.ipHint
    ? paragraph(`Sign-in from: ${escapeHtml(input.ipHint)}`)
    : "";

  const resetUrl = `${appBaseUrl()}/?auth=forgot`;

  const html = layout(
    `
      ${greeting(input.name)}
      ${heading("New sign-in to your Luca account")}
      ${paragraph(`Your Luca account was signed in on ${escapeHtml(input.when)}.`)}
      ${ipBlock}
      ${paragraph(
        `If this was not you, reset your password or contact <a href="mailto:${SUPPORT_EMAIL}" style="color:${LINK};font-weight:normal;text-decoration:underline;">${SUPPORT_EMAIL}</a>.`,
      )}
      ${primaryButton(resetUrl, "Reset Password")}
      ${signOff()}
    `,
  );

  const text = [
    `Hi ${input.name} !`,
    ``,
    `New sign-in on ${input.when}.`,
    input.ipHint ? `From: ${input.ipHint}` : "",
    ``,
    `If this wasn't you: ${resetUrl}`,
    ``,
    `Regards,`,
    `luca Team`,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

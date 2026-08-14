export type EmailFrom = { name: string; address: string };

export function parseEmailFrom(raw: string | undefined): EmailFrom {
  const fallback = { name: "luca Team", address: "info@lucaai.app" };
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;

  const angle = /^(.+?)\s*<([^>]+)>$/.exec(trimmed);
  if (angle) {
    return { name: angle[1]!.trim(), address: angle[2]!.trim() };
  }
  if (trimmed.includes("@")) {
    return { name: "luca Team", address: trimmed };
  }
  return fallback;
}

export function emailFromHeader(): string {
  const { name, address } = parseEmailFrom(process.env.AUTH_EMAIL_FROM);
  return `${name} <${address}>`;
}

export function smtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim(),
  );
}

export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function emailTransportConfigured(): boolean {
  return smtpConfigured() || resendConfigured();
}

export function smtpOptions() {
  const host = process.env.SMTP_HOST!.trim();
  const port = Number(process.env.SMTP_PORT ?? 465);
  const secure =
    process.env.SMTP_SECURE === "0"
      ? false
      : port === 465 || process.env.SMTP_SECURE === "1";
  return {
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER!.trim(),
      pass: process.env.SMTP_PASS!.trim(),
    },
  };
}

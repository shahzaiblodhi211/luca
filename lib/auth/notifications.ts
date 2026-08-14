import {
  emailTransportConfigured,
  sendEmail,
  signInNoticeEmail,
  welcomeEmail,
} from "@/lib/email";

export function sendWelcomeEmail(user: {
  email: string;
  name: string;
}): void {
  if (!emailTransportConfigured()) return;
  const mail = welcomeEmail({ name: user.name });
  void sendEmail({
    to: user.email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    replyTo: "info@lucaai.app",
  }).then((r) => {
    if (!r.ok) console.error("[auth] welcome email:", r.error);
  });
}

export function sendSignInNoticeEmail(user: {
  email: string;
  name: string;
  ipHint?: string;
}): void {
  if (!emailTransportConfigured()) return;
  const when = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
  const mail = signInNoticeEmail({
    name: user.name,
    when: `${when} UTC`,
    ipHint: user.ipHint,
  });
  void sendEmail({
    to: user.email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    replyTo: "info@lucaai.app",
  }).then((r) => {
    if (!r.ok) console.error("[auth] sign-in notice:", r.error);
  });
}

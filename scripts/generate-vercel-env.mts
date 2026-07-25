/**
 * Builds deploy/vercel-env-import.env from .env.local + gemini-keys.txt
 * for Vercel → Settings → Environment Variables → Import .env
 *
 * Usage: npx tsx scripts/generate-vercel-env.mts
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const root = resolve(import.meta.dirname, "..");
const outPath = resolve(root, "deploy/vercel-env-import.env");

function parseDotEnv(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function loadGeminiKeys(): string[] {
  const file = resolve(root, "gemini-keys.txt");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

const envLocalPath = resolve(root, ".env.local");
if (!existsSync(envLocalPath)) {
  console.error("Missing .env.local — create it first.");
  process.exit(1);
}

const local = parseDotEnv(readFileSync(envLocalPath, "utf8"));
const geminiKeys = loadGeminiKeys();

/** Production app URL until lucaai.app DNS is live */
const appUrl =
  process.env.VERCEL_APP_URL?.trim() ||
  "https://luca-ai.vercel.app";

const lines: string[] = [
  "# Generated for Vercel import — do not commit (see .gitignore)",
  "# Vercel → luca-ai → Settings → Environment Variables → Import .env",
  "# Enable: Production (+ Preview if you want)",
  "",
  "SKIP_PLAYWRIGHT=1",
  "",
  `MONGODB_URI=${local.MONGODB_URI ?? ""}`,
  `AUTH_SECRET=${local.AUTH_SECRET ?? ""}`,
  `NEXT_PUBLIC_APP_URL=${appUrl}`,
  "",
  `GEMINI_MODEL=${local.GEMINI_MODEL ?? "gemini-3.5-flash-lite"}`,
  `GEMINI_THINKING_LEVEL=${local.GEMINI_THINKING_LEVEL ?? "HIGH"}`,
  "",
  `IMAGE_PROVIDER=${local.IMAGE_PROVIDER ?? "pollinations"}`,
  `POLLINATIONS_MODEL=${local.POLLINATIONS_MODEL ?? "flux"}`,
  "",
];

if (geminiKeys.length > 0) {
  geminiKeys.forEach((key, i) => {
    lines.push(`GEMINI_API_KEY_${i + 1}=${key}`);
  });
} else if (local.GEMINI_API_KEYS) {
  lines.push(`GEMINI_API_KEYS=${local.GEMINI_API_KEYS}`);
} else if (local.GEMINI_API_KEY_1) {
  for (let i = 1; i <= 500; i++) {
    const k = local[`GEMINI_API_KEY_${i}`];
    if (!k) break;
    lines.push(`GEMINI_API_KEY_${i}=${k}`);
  }
}

if (local.GEMINI_POOL_RPM) {
  lines.push("", `GEMINI_POOL_RPM=${local.GEMINI_POOL_RPM}`);
}

if (local.RESEND_API_KEY?.trim()) {
  lines.push(
    "",
    `RESEND_API_KEY=${local.RESEND_API_KEY}`,
    `AUTH_EMAIL_FROM=${local.AUTH_EMAIL_FROM ?? "Luca AI <noreply@lucaai.app>"}`,
  );
}

lines.push(
  "",
  "PREVIEW_WORKER_URL=https://preview.lucaai.app",
  "NEXT_PUBLIC_PREVIEW_ORIGIN=https://preview.lucaai.app",
  "",
  "# Optional billing (when Stripe is wired)",
  "# STRIPE_SECRET_KEY=",
  "",
);

writeFileSync(outPath, lines.join("\n"), "utf8");
console.log(`Wrote ${outPath}`);
console.log(`  ${geminiKeys.length} Gemini key(s), NEXT_PUBLIC_APP_URL=${appUrl}`);

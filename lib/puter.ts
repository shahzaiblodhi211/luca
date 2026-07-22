import OpenAI from "openai";

const PUTER_BASE_URL = "https://api.puter.com/puterai/openai/v1/";

/** Puter auth tokens (dashboard → Create token). Comma-separated or PUTER_AUTH_TOKEN_1…N. */
export function getPuterTokens(): string[] {
  const numbered: string[] = [];
  for (let i = 1; i <= 20; i++) {
    const t = process.env[`PUTER_AUTH_TOKEN_${i}`]?.trim();
    if (t) numbered.push(t);
  }
  const csv = (process.env.PUTER_AUTH_TOKEN || process.env.PUTER_AUTH_TOKENS || "")
    .split(/[,;\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  return [...new Set([...numbered, ...csv])];
}

export function isPuterConfigured(): boolean {
  return getPuterTokens().length > 0;
}

export function getPuterModel(): string {
  return (
    process.env.PUTER_MODEL?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    "google/gemini-3.5-flash"
  );
}

export type AiProviderMode = "auto" | "gemini" | "puter" | "puter-first";

/**
 * Switch providers in `.env.local` via `AI_PROVIDER`:
 * - `gemini`      — Google AI Studio keys only
 * - `puter`       — Puter only
 * - `auto`        — Gemini first, Puter if Gemini fails (default)
 * - `puter-first` — Puter first, Gemini if Puter fails
 *
 * Aliases: google → gemini, puter.js → puter, puter_first → puter-first
 */
export function getAiProviderMode(): AiProviderMode {
  const raw = (process.env.AI_PROVIDER || "auto").trim().toLowerCase();
  if (raw === "gemini" || raw === "google" || raw === "ai-studio") {
    return "gemini";
  }
  if (raw === "puter" || raw === "puter.js" || raw === "puterjs") {
    return "puter";
  }
  if (
    raw === "puter-first" ||
    raw === "puter_first" ||
    raw === "puter-priority"
  ) {
    return "puter-first";
  }
  return "auto";
}

export function describeAiProviderMode(mode: AiProviderMode = getAiProviderMode()): string {
  switch (mode) {
    case "gemini":
      return "gemini-only";
    case "puter":
      return "puter-only";
    case "puter-first":
      return "puter → gemini fallback";
    default:
      return "gemini → puter fallback";
  }
}

export function createPuterClient(authToken: string): OpenAI {
  return new OpenAI({
    apiKey: authToken,
    baseURL: PUTER_BASE_URL,
    dangerouslyAllowBrowser: false,
  });
}

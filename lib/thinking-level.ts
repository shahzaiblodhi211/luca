export const THINKING_LEVELS = ["MINIMAL", "LOW", "MEDIUM", "HIGH"] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

/** Official Gemini REST values (lowercase). */
export type ApiThinkingLevel = "minimal" | "low" | "medium" | "high";

export const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
  MINIMAL: "Minimal",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

export const THINKING_LEVEL_HINTS: Record<ThinkingLevel, string> = {
  MINIMAL: "Fastest · light reasoning",
  LOW: "Snappy · good default",
  MEDIUM: "Balanced depth",
  HIGH: "Deepest · slower",
};

const STORAGE_KEY = "luca-thinking-level";

export function parseThinkingLevel(
  value: unknown,
  fallback: ThinkingLevel = "LOW",
): ThinkingLevel {
  const raw = String(value || "")
    .trim()
    .toUpperCase();
  if ((THINKING_LEVELS as readonly string[]).includes(raw)) {
    return raw as ThinkingLevel;
  }
  return fallback;
}

/** Gemini API expects lowercase thinkingLevel (e.g. "high", not "HIGH"). */
export function toApiThinkingLevel(
  value?: ThinkingLevel | string | null,
): ApiThinkingLevel {
  return parseThinkingLevel(value, "LOW").toLowerCase() as ApiThinkingLevel;
}

export function readStoredThinkingLevel(): ThinkingLevel {
  if (typeof window === "undefined") return "LOW";
  try {
    return parseThinkingLevel(localStorage.getItem(STORAGE_KEY), "LOW");
  } catch {
    return "LOW";
  }
}

export function storeThinkingLevel(level: ThinkingLevel) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, level);
  } catch {
    /* ignore */
  }
}

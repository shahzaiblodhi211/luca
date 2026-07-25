import { parseThinkingLevel, type ThinkingLevel } from "@/lib/thinking-level";

const RANK: Record<ThinkingLevel, number> = {
  MINIMAL: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

function envThinkingFloor(): ThinkingLevel {
  const raw = process.env.GEMINI_THINKING_LEVEL?.trim();
  if (!raw) return "HIGH";
  return parseThinkingLevel(raw, "HIGH");
}

/**
 * Effective Gemini API thinking level. UI/plan caps are separate — this only
 * drives `thinkingConfig` so `includeThoughts` summaries actually stream.
 */
export function resolveGeminiThinkingLevel(
  model: string,
  level?: ThinkingLevel | string | null,
): ThinkingLevel {
  const planLevel = parseThinkingLevel(level, "LOW");
  let resolved = planLevel;

  const floor = envThinkingFloor();
  if (RANK[resolved] < RANK[floor]) {
    resolved = floor;
  }

  if (/flash-lite/i.test(model) && RANK[resolved] < RANK.HIGH) {
    resolved = "HIGH";
  } else if (RANK[resolved] < RANK.MEDIUM) {
    resolved = "MEDIUM";
  }

  return resolved;
}

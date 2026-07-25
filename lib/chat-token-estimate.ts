import type { LucaModelTier } from "@/lib/luca-model-tier";
import { LUCA_MODEL_TIERS } from "@/lib/luca-model-tier";

/** Rough token estimate (~4 chars / token) for context UI. */
export function estimateTokensFromText(text: string): number {
  if (!text?.trim()) return 0;
  return Math.ceil(text.length / 4);
}

export type ContextUsageSnapshot = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  totalTokens: number;
};

export function estimateContextUsage(
  messages: Array<{ role: string; content?: string }>,
  draft = "",
): ContextUsageSnapshot {
  let inputTokens = 0;
  let outputTokens = 0;

  for (const m of messages) {
    const t = estimateTokensFromText(m.content ?? "");
    if (m.role === "user") inputTokens += t;
    else if (m.role === "assistant") outputTokens += t;
    else inputTokens += t;
  }

  inputTokens += estimateTokensFromText(draft);

  return {
    inputTokens,
    outputTokens,
    reasoningTokens: 0,
    cachedInputTokens: 0,
    totalTokens: inputTokens + outputTokens,
  };
}

/** Display context window cap per Luca tier (approximate). */
export function contextMaxTokensForTier(tier: LucaModelTier): number {
  void LUCA_MODEL_TIERS[tier];
  return 1_048_576;
}

export function contextModelIdForTier(tier: LucaModelTier): string {
  return `luca:${tier}`;
}

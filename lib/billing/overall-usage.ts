import type { PublicBilling } from "@/lib/billing/types";
import type { LucaModelTier } from "@/lib/luca-model-tier";
import { contextMaxTokensForTier } from "@/lib/chat-token-estimate";

/** Account-wide composer usage — same on every chat, not per-thread. */
export function overallAccountUsage(
  billing: PublicBilling | null | undefined,
  lucaModelTier: LucaModelTier,
) {
  const windowCap = contextMaxTokensForTier(lucaModelTier);

  if (!billing) {
    return {
      usedTokens: 0,
      maxTokens: windowCap,
      usedToday: 0,
      remaining: 0,
    };
  }

  if (billing.billingExempt) {
    return {
      usedTokens: 0,
      maxTokens: windowCap,
      usedToday: 0,
      remaining: billing.creditsRemaining,
    };
  }

  const usedMonthly = Math.max(
    0,
    billing.monthlyCredits - billing.creditsRemaining,
  );

  return {
    usedTokens: usedMonthly,
    maxTokens: billing.monthlyCredits,
    usedToday: billing.creditsUsedToday,
    remaining: billing.creditsRemaining,
  };
}

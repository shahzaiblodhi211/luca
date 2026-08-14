"use client";

import { useMemo } from "react";
import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextTrigger,
  TokensLine,
} from "@/components/ai-elements/context";
import { overallAccountUsage } from "@/lib/billing/overall-usage";
import type { PublicBilling } from "@/lib/billing/types";
import { contextModelIdForTier } from "@/lib/chat-token-estimate";
import type { LucaModelTier } from "@/lib/luca-model-tier";
import { LUCA_MODEL_TIERS } from "@/lib/luca-model-tier";

export function ComposerContextUsage({
  lucaModelTier,
  billing,
  disabled,
}: {
  lucaModelTier: LucaModelTier;
  billing?: PublicBilling | null;
  disabled?: boolean;
}) {
  const account = useMemo(
    () => overallAccountUsage(billing, lucaModelTier),
    [billing, lucaModelTier],
  );

  const creditsLabel =
    billing?.billingExempt
      ? "Unlimited credits"
      : billing
        ? `${billing.creditsRemaining.toLocaleString()} credits left`
        : "Sign in for credits";

  return (
    <Context
      maxTokens={account.maxTokens}
      modelId={contextModelIdForTier(lucaModelTier)}
      usedTokens={account.usedTokens}
      usage={{
        inputTokens: account.usedToday,
        outputTokens: account.remaining,
        reasoningTokens: 0,
        cachedInputTokens: 0,
        totalTokens: account.usedTokens,
      }}
    >
      <ContextTrigger disabled={disabled} />
      <ContextContent>
        <ContextContentHeader
          title={billing?.billingExempt ? "Context window" : "Credits used"}
          quotaLabel={
            billing?.billingExempt ? "of window" : "of monthly plan"
          }
        />
        <ContextContentBody>
          <TokensLine label="Used today" tokens={account.usedToday} />
          <TokensLine label="Remaining" tokens={account.remaining} />
        </ContextContentBody>
        <ContextContentFooter>
          <span className="text-zinc-500">
            {LUCA_MODEL_TIERS[lucaModelTier].label}
          </span>
          <span className="font-medium text-zinc-200">{creditsLabel}</span>
        </ContextContentFooter>
      </ContextContent>
    </Context>
  );
}

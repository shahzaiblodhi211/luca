"use client";

import { useMemo } from "react";
import {
  Context,
  ContextCacheUsage,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextTrigger,
} from "@/components/ai-elements/context";
import type { PublicBilling } from "@/lib/billing/types";
import {
  contextMaxTokensForTier,
  contextModelIdForTier,
  estimateContextUsage,
} from "@/lib/chat-token-estimate";
import type { LucaModelTier } from "@/lib/luca-model-tier";
import { LUCA_MODEL_TIERS } from "@/lib/luca-model-tier";

type MessageSlice = { role: string; content?: string };

export function ComposerContextUsage({
  messages = [],
  draft = "",
  lucaModelTier,
  billing,
  disabled,
}: {
  messages?: MessageSlice[];
  draft?: string;
  lucaModelTier: LucaModelTier;
  billing?: PublicBilling | null;
  disabled?: boolean;
}) {
  const usage = useMemo(
    () => estimateContextUsage(messages, draft),
    [messages, draft],
  );

  const maxTokens = contextMaxTokensForTier(lucaModelTier);
  const usedTokens = Math.min(
    maxTokens,
    usage.inputTokens + usage.outputTokens,
  );

  const creditsLabel =
    billing?.billingExempt
      ? "Unlimited credits"
      : billing
        ? `${billing.creditsRemaining.toLocaleString()} credits left`
        : "Sign in for credits";

  return (
    <Context
      maxTokens={maxTokens}
      modelId={contextModelIdForTier(lucaModelTier)}
      usedTokens={usedTokens}
      usage={{
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        reasoningTokens: usage.reasoningTokens,
        cachedInputTokens: usage.cachedInputTokens,
        totalTokens: usage.totalTokens,
      }}
    >
      <ContextTrigger disabled={disabled} />
      <ContextContent>
        <ContextContentHeader />
        <ContextContentBody>
          <ContextInputUsage />
          <ContextOutputUsage />
          <ContextReasoningUsage />
          <ContextCacheUsage />
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

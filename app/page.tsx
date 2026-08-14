"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useAuthModal } from "@/components/auth/auth-context";
import { usePlansModal } from "@/components/billing/plans-modal";
import { AppShell } from "@/components/chat/app-shell";
import { LucaModelPicker } from "@/components/chat/luca-model-picker";
import {
  PromptForm,
  type PromptSubmitPayload,
} from "@/components/chat/prompt-form";
import { thinkingLevelForPlan } from "@/lib/billing/plans";
import type { PlanId } from "@/lib/billing/plans";
import {
  readStoredLucaModelTier,
  resolveLucaModelTier,
  storeLucaModelTier,
  type LucaModelTier,
} from "@/lib/luca-model-tier";

const SUGGESTIONS: { label: string; prompt: string }[] = [
  {
    label: "SaaS landing",
    prompt:
      "Build a modern SaaS landing page with pricing tiers, social proof, feature sections, and a strong hero. Ship responsive layout and polished interactions—not a generic template look.",
  },
  {
    label: "Stopwatch",
    prompt:
      "Create a stopwatch component with start, pause, reset, and lap times. Clean typography, accessible controls, and smooth state transitions.",
  },
  {
    label: "Admin dashboard",
    prompt:
      "Make an admin dashboard with a sidebar, KPI cards, charts for trends, and a recent activity table. Dark-friendly UI with clear hierarchy.",
  },
  {
    label: "Ecommerce",
    prompt:
      "Build a full ecommerce storefront: product grid, product detail page, cart, and checkout. Include categories, search, and a polished shop experience with realistic product data—not a placeholder-only demo.",
  },
];

function HomeHero() {
  const router = useRouter();
  const { openAuth, user, billing, setBilling } = useAuthModal();
  const { openPlans } = usePlansModal();
  const planId = (billing?.planId ?? "free") as PlanId;
  const [lucaModelTier, setLucaModelTier] = useState<LucaModelTier>(() =>
    readStoredLucaModelTier(planId),
  );

  const handleModelTierChange = (tier: LucaModelTier) => {
    const resolved = resolveLucaModelTier(planId, tier);
    storeLucaModelTier(resolved);
    setLucaModelTier(resolved);
  };

  const showHeaderUpgrade =
    !billing?.billingExempt && planId !== "pro";

  async function startChat(payload: PromptSubmitPayload) {
    if (!user) {
      openAuth("login");
      throw new Error("Sign in to start a chat.");
    }
    const res = await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: payload.text,
        attachmentIds: payload.attachments.map((a) => a.id),
        thinkingLevel: payload.thinkingLevel,
        lucaModelTier: payload.lucaModelTier,
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        code?: string;
        billing?: import("@/lib/billing/types").PublicBilling;
      } | null;
      if (res.status === 401) openAuth("login");
      if (res.status === 402) {
        if (data?.billing) setBilling(data.billing);
        openPlans();
      }
      throw new Error(data?.error || "Failed to create chat");
    }
    const data = (await res.json()) as {
      chat: { id: string; lucaModelTier?: string | null };
    };
    const tier = data.chat.lucaModelTier ?? payload.lucaModelTier;
    storeLucaModelTier(payload.lucaModelTier);
    const modelQuery = tier
      ? `&model=${encodeURIComponent(tier)}`
      : "";
    router.push(`/c/${data.chat.id}?start=1${modelQuery}`);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between px-4 pb-1 pt-4 sm:px-5 sm:pt-5">
        <LucaModelPicker
          variant="header"
          value={lucaModelTier}
          planId={planId}
          onChange={handleModelTierChange}
          onUpgrade={() => openPlans()}
        />
        {showHeaderUpgrade ? (
          <button
            type="button"
            onClick={() => openPlans()}
            className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-[15px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/10 hover:text-emerald-300"
          >
            <Sparkles className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
            Upgrade
          </button>
        ) : null}
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-[10vh]">
        <div className="w-full max-w-3xl">
          <h1 className="mb-3.5 text-center text-[1.625rem] font-normal tracking-tight text-zinc-200 sm:text-[1.75rem]">
            Make your space live in minutes
            <span className="text-emerald-600">.</span>
          </h1>

          <PromptForm
            animatedBuildPlaceholder
            lucaModelTier={lucaModelTier}
            onLucaModelTierChange={handleModelTierChange}
            onSubmit={startChat}
          />

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() =>
                  void startChat({
                    text: s.prompt,
                    attachments: [],
                    thinkingLevel: thinkingLevelForPlan(planId),
                    lucaModelTier,
                  })
                }
                className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-zinc-50 active:bg-zinc-800/90"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <AppShell>
      <HomeHero />
    </AppShell>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useAuthModal } from "@/components/auth/auth-context";
import { usePlansModal } from "@/components/billing/plans-modal";
import { LucaMark } from "@/components/brand/logo";
import { AppShell } from "@/components/chat/app-shell";
import {
  PromptForm,
  type PromptSubmitPayload,
} from "@/components/chat/prompt-form";
import { thinkingLevelForPlan } from "@/lib/billing/plans";
import type { PlanId } from "@/lib/billing/plans";
import { readStoredLucaModelTier } from "@/lib/luca-model-tier";

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
  const { openAuth, user, logout, billing } = useAuthModal();
  const { openPlans } = usePlansModal();

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
      } | null;
      if (res.status === 401) openAuth("login");
      if (res.status === 402) openPlans();
      throw new Error(data?.error || "Failed to create chat");
    }
    const data = (await res.json()) as { chat: { id: string } };
    router.push(`/c/${data.chat.id}?start=1`);
  }

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(52,211,153,0.08),_transparent_50%),radial-gradient(ellipse_at_bottom,_rgba(113,113,122,0.12),_transparent_55%)]"
      />
      <div className="absolute right-4 top-3 z-20 flex items-center gap-2 sm:right-6">
        {user ? (
          <>
            <span className="hidden max-w-[10rem] truncate text-sm text-zinc-400 sm:inline">
              {user.name}
            </span>
            <button
              type="button"
              onClick={() => {
                void logout().then(() => router.push("/"));
              }}
              className="rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition-colors duration-150 hover:bg-zinc-900 hover:text-zinc-50"
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => openAuth("login")}
              className="rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition-colors duration-150 hover:bg-zinc-900 hover:text-zinc-50"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => openAuth("signup")}
              className="rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-950 transition-colors duration-150 hover:bg-white active:bg-zinc-200"
            >
              Sign up
            </button>
          </>
        )}
      </div>

      <div className="relative z-10 w-full max-w-3xl space-y-8 text-center">
        <div className="space-y-5">
          <div className="mx-auto flex h-14 w-14 items-center justify-center">
            <LucaMark size="lg" />
          </div>
          <h1 className="text-[1.75rem] font-semibold leading-snug tracking-tight text-white sm:text-4xl md:text-[2.5rem] md:whitespace-nowrap">
            Make your space live in minutes
            <span className="text-emerald-600">.</span>
          </h1>
        </div>

        <PromptForm animatedBuildPlaceholder onSubmit={startChat} />

        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() =>
                void startChat({
                  text: s.prompt,
                  attachments: [],
                  thinkingLevel: thinkingLevelForPlan(
                    (billing?.planId ?? "free") as PlanId,
                  ),
                  lucaModelTier: readStoredLucaModelTier(
                    (billing?.planId ?? "free") as PlanId,
                  ),
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
  );
}

export default function HomePage() {
  return (
    <AppShell>
      <HomeHero />
    </AppShell>
  );
}

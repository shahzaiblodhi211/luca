import type { ThinkingLevel } from "@/lib/thinking-level";
import { LUCA_SPARK, LUCA_TURBO, LUCA_ULTRA } from "@/lib/luca-models";

export type PlanId = "free" | "plus" | "pro";

export type PlanDefinition = {
  id: PlanId;
  name: string;
  priceMonthlyUsd: number;
  tagline: string;
  model: string;
  modelLabel: string;
  monthlyCredits: number;
  dailyCredits: number;
  monthlyFigmaImports: number;
  maxThinkingLevel: ThinkingLevel;
  popular?: boolean;
  features: string[];
};

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthlyUsd: 0,
    tagline: "Try Luca and ship your first ideas.",
    model: "gemini-3.5-flash-lite",
    modelLabel: LUCA_SPARK,
    monthlyCredits: 120,
    dailyCredits: 10,
    monthlyFigmaImports: 0,
    maxThinkingLevel: "LOW",
    features: [
      `${LUCA_SPARK} builder`,
      "120 builder credits / month",
      "Up to 10 credits / day",
      "Code preview & live projects",
      "Image attachments (standard limits)",
      "Thinking: Minimal & Low",
    ],
  },
  plus: {
    id: "plus",
    name: "Plus",
    priceMonthlyUsd: 20,
    tagline: "Faster model, Figma import, and room for daily building.",
    model: "gemini-3.6-flash",
    modelLabel: LUCA_TURBO,
    monthlyCredits: 600,
    dailyCredits: 30,
    monthlyFigmaImports: 30,
    maxThinkingLevel: "MEDIUM",
    popular: true,
    features: [
      "Everything in Free",
      `${LUCA_TURBO} builder`,
      "Figma import — files, frames, FigJam, Slides & Make",
      "30 Figma imports / month",
      "600 builder credits / month",
      "Up to 30 credits / day",
      "Thinking up to Medium",
      "Higher attachment limits",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthlyUsd: 60,
    tagline: "Best model, full Figma access, and highest limits.",
    model: "gemini-3.7-flash",
    modelLabel: LUCA_ULTRA,
    monthlyCredits: 2000,
    dailyCredits: 80,
    monthlyFigmaImports: 100,
    maxThinkingLevel: "HIGH",
    features: [
      "Everything in Plus",
      `${LUCA_ULTRA} builder`,
      "Full Figma access",
      "100 Figma imports / month",
      "2,000 builder credits / month",
      "Up to 80 credits / day",
      "Thinking up to High",
      "Largest attachments & exports",
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ["free", "plus", "pro"];

export function getPlan(planId: unknown): PlanDefinition {
  const id = String(planId || "free").toLowerCase();
  if (id === "plus" || id === "pro") return PLANS[id];
  return PLANS.free;
}

const THINKING_RANK: Record<ThinkingLevel, number> = {
  MINIMAL: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

export function capThinkingLevelForPlan(
  level: ThinkingLevel,
  planId: PlanId,
): ThinkingLevel {
  const plan = getPlan(planId);
  const max = THINKING_RANK[plan.maxThinkingLevel];
  const cur = THINKING_RANK[level];
  if (cur <= max) return level;
  return plan.maxThinkingLevel;
}

/** Default thinking depth for a plan (no manual picker). */
export function thinkingLevelForPlan(planId: PlanId): ThinkingLevel {
  return getPlan(planId).maxThinkingLevel;
}

export function canUseThinkingLevelForPlan(
  planId: PlanId,
  level: ThinkingLevel,
): boolean {
  const plan = getPlan(planId);
  return THINKING_RANK[level] <= THINKING_RANK[plan.maxThinkingLevel];
}

export function maxThinkingLevelForPlan(planId: PlanId): ThinkingLevel {
  return getPlan(planId).maxThinkingLevel;
}

export function canUseFigmaForPlan(planId: PlanId): boolean {
  return getPlan(planId).monthlyFigmaImports > 0;
}

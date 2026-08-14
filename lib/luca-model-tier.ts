import type { PlanId } from "@/lib/billing/plans";
import { LUCA_SPARK, LUCA_TURBO, LUCA_ULTRA } from "@/lib/luca-models";

export type LucaModelTier = "spark" | "turbo" | "ultra";

export const LUCA_MODEL_TIER_ORDER: LucaModelTier[] = [
  "spark",
  "turbo",
  "ultra",
];

export type LucaModelTierMeta = {
  id: LucaModelTier;
  label: string;
  apiModel: string;
  minPlan: PlanId;
  hint: string;
};

export const LUCA_MODEL_TIERS: Record<LucaModelTier, LucaModelTierMeta> = {
  spark: {
    id: "spark",
    label: LUCA_SPARK,
    apiModel: "gemini-3.5-flash-lite",
    minPlan: "free",
    hint: "Fastest · everyday builds",
  },
  turbo: {
    id: "turbo",
    label: LUCA_TURBO,
    apiModel: "gemini-3.5-flash",
    minPlan: "plus",
    hint: "Balanced · stronger reasoning",
  },
  ultra: {
    id: "ultra",
    label: LUCA_ULTRA,
    apiModel: "gemini-3.6-flash",
    minPlan: "pro",
    hint: "Best quality · complex apps",
  },
};

const PLAN_RANK: Record<PlanId, number> = {
  free: 0,
  plus: 1,
  pro: 2,
};

export function parseLucaModelTier(value: unknown): LucaModelTier | null {
  const raw = String(value || "").toLowerCase();
  if (raw === "spark" || raw === "turbo" || raw === "ultra") return raw;
  return null;
}

export function canUseLucaModelTier(
  planId: PlanId,
  tier: LucaModelTier,
): boolean {
  const need = LUCA_MODEL_TIERS[tier].minPlan;
  return PLAN_RANK[planId] >= PLAN_RANK[need];
}

export function defaultLucaModelTierForPlan(planId: PlanId): LucaModelTier {
  if (planId === "pro") return "ultra";
  if (planId === "plus") return "turbo";
  return "spark";
}

/** Pick a tier the user is allowed to run (falls back to plan default). */
export function resolveLucaModelTier(
  planId: PlanId,
  requested?: LucaModelTier | string | null,
): LucaModelTier {
  const parsed = parseLucaModelTier(requested);
  const tier = parsed ?? defaultLucaModelTierForPlan(planId);
  if (canUseLucaModelTier(planId, tier)) return tier;
  return defaultLucaModelTierForPlan(planId);
}

export function geminiModelForLucaTier(tier: LucaModelTier): string {
  return LUCA_MODEL_TIERS[tier].apiModel;
}

const STORAGE_KEY = "luca-model-tier";

export function readStoredLucaModelTier(
  planId: PlanId = "free",
): LucaModelTier {
  if (typeof window === "undefined") {
    return defaultLucaModelTierForPlan(planId);
  }
  try {
    const stored = parseLucaModelTier(localStorage.getItem(STORAGE_KEY));
    if (stored && canUseLucaModelTier(planId, stored)) return stored;
  } catch {
    /* ignore */
  }
  return defaultLucaModelTierForPlan(planId);
}

export function storeLucaModelTier(tier: LucaModelTier) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, tier);
  } catch {
    /* ignore */
  }
}

/** Prefer localStorage, then chat record, then active UI selection. */
export function resolveLucaModelTierForUi(
  planId: PlanId,
  opts?: {
    chatTier?: string | null;
    current?: LucaModelTier | null;
  },
): LucaModelTier {
  try {
    if (typeof window !== "undefined") {
      const stored = parseLucaModelTier(localStorage.getItem(STORAGE_KEY));
      if (stored && canUseLucaModelTier(planId, stored)) return stored;
    }
  } catch {
    /* ignore */
  }

  const fromChat = parseLucaModelTier(opts?.chatTier);
  if (fromChat && canUseLucaModelTier(planId, fromChat)) return fromChat;

  if (opts?.current && canUseLucaModelTier(planId, opts.current)) {
    return opts.current;
  }

  return defaultLucaModelTierForPlan(planId);
}

/** Trust chat record on first paint (server already resolved tier on create). */
export function lucaModelTierFromChatRecord(
  chatTier?: string | null,
  planId: PlanId = "free",
): LucaModelTier {
  const fromChat = parseLucaModelTier(chatTier);
  if (fromChat) return fromChat;
  return resolveLucaModelTierForUi(planId);
}

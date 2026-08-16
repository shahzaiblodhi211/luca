import type { UserDoc } from "@/lib/auth/types";
import { findUserById, getUsersCollection } from "@/lib/auth/users";
import { BillingError } from "./errors";
import {
  canUseFigmaForPlan,
  capThinkingLevelForPlan,
  getPlan,
  type PlanId,
} from "./plans";
import {
  currentBillingPeriod,
  isLegacyMonthKey,
  isSignupInferredAnchor,
  resolveBillingAnchor,
  toDate,
} from "./period";
import type { PublicBilling } from "./types";
import type { ThinkingLevel } from "@/lib/thinking-level";
import {
  geminiModelForLucaTier,
  resolveLucaModelTier,
  type LucaModelTier,
} from "@/lib/luca-model-tier";

const EXEMPT_CREDITS = 999_999;

function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function utcMonthKey(d = new Date()): string {
  return d.toISOString().slice(0, 7);
}

function defaultBillingFields(now = new Date()): Pick<
  UserDoc,
  | "planId"
  | "creditsRemaining"
  | "creditsUsedToday"
  | "figmaImportsUsed"
  | "billingPeriodKey"
  | "billingCycleAnchor"
  | "usageDayKey"
  | "billingExempt"
> {
  const plan = getPlan("free");
  const period = currentBillingPeriod(now, now);
  return {
    planId: "free",
    creditsRemaining: plan.monthlyCredits,
    creditsUsedToday: 0,
    figmaImportsUsed: 0,
    billingPeriodKey: period.key,
    billingCycleAnchor: now,
    usageDayKey: utcDayKey(now),
    billingExempt: false,
  };
}

export function normalizeUserBilling(user: UserDoc): UserDoc {
  const now = new Date();
  const day = utcDayKey(now);
  const planId = (user.planId as PlanId | undefined) ?? "free";
  const plan = getPlan(planId);
  const billingCycleAnchor = resolveBillingAnchor(user);
  const period = currentBillingPeriod(billingCycleAnchor, now);
  let creditsRemaining =
    typeof user.creditsRemaining === "number"
      ? user.creditsRemaining
      : plan.monthlyCredits;
  let creditsUsedToday =
    typeof user.creditsUsedToday === "number" ? user.creditsUsedToday : 0;
  let figmaImportsUsed =
    typeof user.figmaImportsUsed === "number" ? user.figmaImportsUsed : 0;
  let billingPeriodKey = user.billingPeriodKey ?? period.key;
  let usageDayKey = user.usageDayKey ?? day;
  const billingExempt = Boolean(user.billingExempt);

  if (billingExempt) {
    creditsRemaining = EXEMPT_CREDITS;
    creditsUsedToday = 0;
    figmaImportsUsed = 0;
  } else if (isLegacyMonthKey(billingPeriodKey)) {
    billingPeriodKey = period.key;
  } else if (billingPeriodKey !== period.key) {
    billingPeriodKey = period.key;
    creditsRemaining = plan.monthlyCredits;
    figmaImportsUsed = 0;
  }

  if (!billingExempt && usageDayKey !== day) {
    usageDayKey = day;
    creditsUsedToday = 0;
  }

  return {
    ...user,
    planId: plan.id,
    creditsRemaining,
    creditsUsedToday,
    figmaImportsUsed,
    billingPeriodKey,
    billingCycleAnchor,
    usageDayKey,
    billingExempt,
  };
}

export async function syncUserBilling(userId: string): Promise<UserDoc | null> {
  const user = await findUserById(userId);
  if (!user) return null;
  const normalized = normalizeUserBilling(user);
  const changed =
    normalized.planId !== user.planId ||
    normalized.creditsRemaining !== user.creditsRemaining ||
    normalized.creditsUsedToday !== user.creditsUsedToday ||
    normalized.figmaImportsUsed !== user.figmaImportsUsed ||
    normalized.billingPeriodKey !== user.billingPeriodKey ||
    (!isSignupInferredAnchor(normalized) &&
      toDate(normalized.billingCycleAnchor)?.getTime() !==
        toDate(user.billingCycleAnchor)?.getTime()) ||
    normalized.usageDayKey !== user.usageDayKey ||
    normalized.billingExempt !== user.billingExempt;

  if (!changed) return normalized;

  const col = await getUsersCollection();
  await col.updateOne(
    { _id: userId },
    {
      $set: {
        planId: normalized.planId,
        creditsRemaining: normalized.creditsRemaining,
        creditsUsedToday: normalized.creditsUsedToday,
        figmaImportsUsed: normalized.figmaImportsUsed,
        billingPeriodKey: normalized.billingPeriodKey,
        ...(isSignupInferredAnchor(normalized)
          ? {}
          : { billingCycleAnchor: normalized.billingCycleAnchor }),
        usageDayKey: normalized.usageDayKey,
        billingExempt: normalized.billingExempt,
        updatedAt: new Date(),
      },
    },
  );
  return normalized;
}

export function toPublicBilling(user: UserDoc): PublicBilling {
  const u = normalizeUserBilling(user);
  const plan = getPlan(u.planId ?? "free");
  const creditsUsedToday = u.billingExempt ? 0 : (u.creditsUsedToday ?? 0);
  const creditsRemaining = u.billingExempt
    ? EXEMPT_CREDITS
    : Math.max(0, u.creditsRemaining ?? 0);
  const dailyCredits = u.billingExempt ? EXEMPT_CREDITS : plan.dailyCredits;
  const creditsRemainingToday = Math.max(0, dailyCredits - creditsUsedToday);

  return {
    planId: plan.id,
    planName: plan.name,
    priceMonthlyUsd: plan.priceMonthlyUsd,
    modelLabel: plan.modelLabel,
    monthlyCredits: u.billingExempt ? EXEMPT_CREDITS : plan.monthlyCredits,
    dailyCredits,
    creditsRemaining,
    creditsUsedToday,
    creditsRemainingToday,
    periodLabel: u.billingPeriodKey ?? utcMonthKey(),
    billingExempt: u.billingExempt ?? false,
    figmaEnabled: u.billingExempt || canUseFigmaForPlan(plan.id),
    monthlyFigmaImports: u.billingExempt
      ? EXEMPT_CREDITS
      : plan.monthlyFigmaImports,
    figmaImportsUsed: u.billingExempt ? 0 : (u.figmaImportsUsed ?? 0),
    figmaImportsRemaining: u.billingExempt
      ? EXEMPT_CREDITS
      : Math.max(0, plan.monthlyFigmaImports - (u.figmaImportsUsed ?? 0)),
  };
}

export function getGeminiModelForUser(
  user: UserDoc,
  requestedTier?: LucaModelTier | string | null,
): string {
  const planId = getPlan(user.planId ?? "free").id;
  const tier = resolveLucaModelTier(planId, requestedTier);
  return geminiModelForLucaTier(tier);
}

export function assertCanSpendCredit(user: UserDoc): void {
  const u = normalizeUserBilling(user);
  if (u.billingExempt) return;
  const plan = getPlan(u.planId ?? "free");
  const remaining = u.creditsRemaining ?? 0;
  const usedToday = u.creditsUsedToday ?? 0;
  if (remaining <= 0) {
    throw new BillingError(
      "You are out of monthly builder credits. Upgrade your plan to keep building.",
      "OUT_OF_CREDITS",
    );
  }
  if (usedToday >= plan.dailyCredits) {
    throw new BillingError(
      "Daily credit limit reached. Try again tomorrow or upgrade your plan.",
      "DAILY_LIMIT",
    );
  }
}

export async function debitChatCredit(userId: string): Promise<void> {
  const user = await syncUserBilling(userId);
  if (!user) throw new Error("User not found");
  assertCanSpendCredit(user);
  if (user.billingExempt) return;

  const col = await getUsersCollection();
  const res = await col.updateOne(
    {
      _id: userId,
      billingExempt: { $ne: true },
      creditsRemaining: { $gt: 0 },
      creditsUsedToday: { $lt: getPlan(user.planId).dailyCredits },
    },
    {
      $inc: { creditsRemaining: -1, creditsUsedToday: 1 },
      $set: { updatedAt: new Date() },
    },
  );
  if (res.modifiedCount === 0) {
    const fresh = await syncUserBilling(userId);
    if (fresh) assertCanSpendCredit(fresh);
    throw new BillingError(
      "Could not use a credit. Upgrade or try again later.",
      "OUT_OF_CREDITS",
    );
  }
}

export async function refundChatCredit(userId: string): Promise<void> {
  const user = await findUserById(userId);
  if (!user || user.billingExempt) return;
  const col = await getUsersCollection();
  await col.updateOne(
    { _id: userId },
    {
      $inc: { creditsRemaining: 1, creditsUsedToday: -1 },
      $set: { updatedAt: new Date() },
    },
  );
}

export async function setUserPlan(
  userId: string,
  planId: PlanId,
  opts?: { billingExempt?: boolean; cycleAnchor?: Date },
): Promise<UserDoc | null> {
  const plan = getPlan(planId);
  const now = new Date();
  const existing = await findUserById(userId);
  const wasFree = (existing?.planId ?? "free") === "free";
  const becomingPaid = plan.id !== "free";
  const samePlan = existing?.planId === plan.id;
  const inferredSignup = existing ? isSignupInferredAnchor(existing) : false;
  let anchor = inferredSignup ? null : toDate(existing?.billingCycleAnchor);
  if (!anchor || (wasFree && becomingPaid)) {
    anchor =
      toDate(opts?.cycleAnchor) ??
      (becomingPaid ? now : (toDate(existing?.createdAt) ?? now));
  }
  const period = currentBillingPeriod(anchor, now);
  const col = await getUsersCollection();
  await col.updateOne(
    { _id: userId },
    {
      $set: {
        planId: plan.id,
        creditsRemaining: opts?.billingExempt
          ? EXEMPT_CREDITS
          : samePlan
            ? (existing?.creditsRemaining ?? plan.monthlyCredits)
            : plan.monthlyCredits,
        creditsUsedToday: samePlan ? (existing?.creditsUsedToday ?? 0) : 0,
        figmaImportsUsed: samePlan ? (existing?.figmaImportsUsed ?? 0) : 0,
        billingPeriodKey: period.key,
        billingCycleAnchor: anchor,
        usageDayKey: utcDayKey(now),
        billingExempt: Boolean(opts?.billingExempt),
        updatedAt: now,
      },
    },
  );
  return findUserById(userId);
}

export function assertCanUseFigma(user: UserDoc): void {
  const u = normalizeUserBilling(user);
  if (u.billingExempt) return;
  const plan = getPlan(u.planId ?? "free");
  if (!canUseFigmaForPlan(plan.id)) {
    throw new BillingError(
      "Figma import is on Plus and Pro. Upgrade to connect Figma and build from files.",
      "PLAN_REQUIRED",
    );
  }
  if ((u.figmaImportsUsed ?? 0) >= plan.monthlyFigmaImports) {
    throw new BillingError(
      `You've used all ${plan.monthlyFigmaImports} Figma imports this month. Upgrade or wait for the next billing period.`,
      "FIGMA_LIMIT",
    );
  }
}

export async function consumeFigmaImport(userId: string): Promise<void> {
  const user = await syncUserBilling(userId);
  if (!user) throw new Error("User not found");
  assertCanUseFigma(user);
  if (user.billingExempt) return;

  const plan = getPlan(user.planId ?? "free");
  const col = await getUsersCollection();
  const res = await col.updateOne(
    {
      _id: userId,
      billingExempt: { $ne: true },
      figmaImportsUsed: { $lt: plan.monthlyFigmaImports },
    },
    {
      $inc: { figmaImportsUsed: 1 },
      $set: { updatedAt: new Date() },
    },
  );
  if (res.modifiedCount === 0) {
    const fresh = await syncUserBilling(userId);
    if (fresh) assertCanUseFigma(fresh);
    throw new BillingError(
      "Could not use a Figma import. Upgrade or try again later.",
      "FIGMA_LIMIT",
    );
  }
}

export function capThinkingForUser(
  user: UserDoc,
  level: ThinkingLevel,
): ThinkingLevel {
  return capThinkingLevelForPlan(level, getPlan(user.planId).id);
}

export { defaultBillingFields, utcDayKey, utcMonthKey };

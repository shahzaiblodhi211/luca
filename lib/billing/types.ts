import type { PlanId } from "./plans";

export type PublicBilling = {
  planId: PlanId;
  planName: string;
  priceMonthlyUsd: number;
  modelLabel: string;
  monthlyCredits: number;
  dailyCredits: number;
  creditsRemaining: number;
  creditsUsedToday: number;
  creditsRemainingToday: number;
  periodLabel: string;
  billingExempt: boolean;
};

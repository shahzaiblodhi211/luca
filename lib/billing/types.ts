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
  figmaEnabled: boolean;
  monthlyFigmaImports: number;
  figmaImportsUsed: number;
  figmaImportsRemaining: number;
};

/** True when the user cannot start another paid chat turn. */
export function isOutOfSpendableCredits(
  billing: PublicBilling | null | undefined,
): boolean {
  if (!billing || billing.billingExempt) return false;
  return billing.creditsRemaining <= 0 || billing.creditsRemainingToday <= 0;
}

export type BillingInvoice = {
  id: string;
  date: string;
  description: string;
  status: string;
  amount: number;
  currency: string;
  invoiceNumber: string | null;
};

export type BillingSubscription = {
  id: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string;
  currentPeriodEnd: string;
};

export type BillingPaymentMethod = {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
};

export type BillingOverview = {
  billing: PublicBilling;
  subscription: BillingSubscription | null;
  invoices: BillingInvoice[];
  paymentMethod: BillingPaymentMethod | null;
};

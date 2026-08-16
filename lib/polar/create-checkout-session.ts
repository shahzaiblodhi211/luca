import { Polar } from "@polar-sh/sdk";
import { appBaseUrl } from "@/lib/auth/app-url";
import type { PublicUser } from "@/lib/auth/types";
import type { PlanId } from "@/lib/billing/plans";
import {
  polarAccessToken,
  polarProductIdForPlan,
  polarServer,
} from "@/lib/polar/config";

export type PolarCheckoutSession = {
  id: string;
  clientSecret: string;
  publishableKey: string;
  customerEmail: string;
  customerName: string;
  amount: number;
  totalAmount: number;
  currency: string;
  isPaymentRequired: boolean;
  isPaymentSetupRequired: boolean;
  isPaymentFormRequired: boolean;
  country: string;
  successUrl: string;
};

function toCheckoutSession(
  checkout: {
    id: string;
    clientSecret?: string | null;
    paymentProcessorMetadata?: Record<string, string>;
    customerEmail?: string | null;
    customerName?: string | null;
    amount?: number | null;
    totalAmount?: number | null;
    currency?: string | null;
    isPaymentRequired?: boolean;
    isPaymentSetupRequired?: boolean;
    isPaymentFormRequired?: boolean;
    customerBillingAddress?: { country?: string | null } | null;
    successUrl?: string | null;
  },
  user: PublicUser,
): PolarCheckoutSession | null {
  const clientSecret = checkout.clientSecret?.trim();
  const publishableKey =
    checkout.paymentProcessorMetadata?.publishable_key?.trim() ||
    checkout.paymentProcessorMetadata?.publishableKey?.trim();
  if (!clientSecret || !publishableKey) return null;

  const base = appBaseUrl().replace(/\/$/, "");
  return {
    id: checkout.id,
    clientSecret,
    publishableKey,
    customerEmail: checkout.customerEmail || user.email,
    customerName: checkout.customerName || user.name,
    amount: checkout.amount ?? 0,
    totalAmount: checkout.totalAmount ?? checkout.amount ?? 0,
    currency: (checkout.currency || "usd").toLowerCase(),
    isPaymentRequired: checkout.isPaymentRequired !== false,
    isPaymentSetupRequired: Boolean(checkout.isPaymentSetupRequired),
    isPaymentFormRequired: checkout.isPaymentFormRequired !== false,
    country: checkout.customerBillingAddress?.country || "PK",
    successUrl: checkout.successUrl || `${base}/billing?checkout=success`,
  };
}

export async function createPolarCheckoutSession(
  user: PublicUser,
  planId: "plus" | "pro",
): Promise<PolarCheckoutSession | null> {
  const token = polarAccessToken();
  const productId = polarProductIdForPlan(planId);
  if (!token || !productId) return null;

  const base = appBaseUrl().replace(/\/$/, "");
  const polar = new Polar({
    accessToken: token,
    server: polarServer(),
  });

  const checkout = await polar.checkouts.create({
    products: [productId],
    customerEmail: user.email,
    customerName: user.name,
    externalCustomerId: user.id,
    successUrl: `${base}/billing?checkout=success`,
    allowDiscountCodes: false,
    metadata: { userId: user.id, planId },
  });

  const mapped = toCheckoutSession(checkout, user);
  if (mapped) return mapped;

  if (!checkout.clientSecret) return null;
  const fresh = await polar.checkouts.clientGet({
    clientSecret: checkout.clientSecret,
  });
  return toCheckoutSession(fresh, user);
}

export { toCheckoutSession };

export function isPaidPlan(planId: string): planId is "plus" | "pro" {
  return planId === "plus" || planId === "pro";
}

export function normalizeCheckoutPlan(planId: unknown): PlanId | null {
  const id = String(planId || "").toLowerCase();
  if (isPaidPlan(id)) return id;
  return null;
}

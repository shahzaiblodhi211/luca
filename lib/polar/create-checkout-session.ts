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
  url: string;
  clientSecret: string;
};

export async function createPolarCheckoutSession(
  user: PublicUser,
  planId: "plus" | "pro",
): Promise<PolarCheckoutSession | null> {
  const token = polarAccessToken();
  const productId = polarProductIdForPlan(planId);
  if (!token || !productId) return null;

  const base = appBaseUrl().replace(/\/$/, "");
  const embedOrigin = new URL(base).origin;

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
    returnUrl: `${base}/checkout?plan=${planId}`,
    embedOrigin,
    metadata: { userId: user.id, planId },
  });

  if (!checkout.url || !checkout.clientSecret) return null;

  return {
    id: checkout.id,
    url: checkout.url,
    clientSecret: checkout.clientSecret,
  };
}

export function isPaidPlan(planId: string): planId is "plus" | "pro" {
  return planId === "plus" || planId === "pro";
}

export function normalizeCheckoutPlan(planId: unknown): PlanId | null {
  const id = String(planId || "").toLowerCase();
  if (isPaidPlan(id)) return id;
  return null;
}

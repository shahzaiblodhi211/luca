import type { PlanId } from "@/lib/billing/plans";

export type PolarServer = "sandbox" | "production";

export function polarServer(): PolarServer {
  return process.env.POLAR_SERVER?.trim() === "production"
    ? "production"
    : "sandbox";
}

export function polarAccessToken(): string | undefined {
  return process.env.POLAR_ACCESS_TOKEN?.trim() || undefined;
}

export function polarConfigured(): boolean {
  return Boolean(polarAccessToken());
}

export function polarWebhookSecret(): string | undefined {
  return process.env.POLAR_WEBHOOK_SECRET?.trim() || undefined;
}

export function polarProductIdForPlan(planId: "plus" | "pro"): string | undefined {
  if (planId === "plus") {
    return process.env.POLAR_PRODUCT_ID_PLUS?.trim() || undefined;
  }
  return process.env.POLAR_PRODUCT_ID_PRO?.trim() || undefined;
}

export function planIdForPolarProduct(productId: string): PlanId | null {
  const id = productId.trim();
  if (!id) return null;
  if (id === process.env.POLAR_PRODUCT_ID_PLUS?.trim()) return "plus";
  if (id === process.env.POLAR_PRODUCT_ID_PRO?.trim()) return "pro";
  return null;
}

export function polarCheckoutEnabled(): boolean {
  return polarConfigured() && Boolean(polarProductIdForPlan("plus"));
}

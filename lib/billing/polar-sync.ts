import { findUserById, getUsersCollection } from "@/lib/auth/users";
import { setUserPlan } from "@/lib/billing/credits";
import { toDate } from "@/lib/billing/period";
import type { PlanId } from "@/lib/billing/plans";
import {
  getPolarClient,
  planIdForPolarProduct,
} from "@/lib/polar/config";

type PolarRecord = Record<string, unknown>;

function readString(obj: PolarRecord | undefined, ...keys: string[]): string {
  if (!obj) return "";
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return "";
}

function readRecord(obj: PolarRecord | undefined, key: string): PolarRecord | undefined {
  const val = obj?.[key];
  return val && typeof val === "object" ? (val as PolarRecord) : undefined;
}

function extractUserId(data: PolarRecord): string | null {
  const metadata = readRecord(data, "metadata");
  const fromMeta = readString(metadata ?? {}, "userId", "user_id");
  if (fromMeta) return fromMeta;

  const fromTop = readString(
    data,
    "externalCustomerId",
    "external_customer_id",
    "customerExternalId",
    "customer_external_id",
  );
  if (fromTop) return fromTop;

  const customer = readRecord(data, "customer");
  const external = readString(
    customer ?? {},
    "externalId",
    "external_id",
    "externalCustomerId",
  );
  return external || null;
}

function extractPlanId(data: PolarRecord): PlanId | null {
  const productId = extractProductId(data);
  const fromProduct = productId ? planIdForPolarProduct(productId) : null;
  if (fromProduct) return fromProduct;

  const metadata = readRecord(data, "metadata");
  const fromMeta = readString(metadata ?? {}, "planId", "plan_id").toLowerCase();
  if (fromMeta === "plus" || fromMeta === "pro") return fromMeta;
  return null;
}

function extractProductId(data: PolarRecord): string | null {
  const direct = readString(data, "productId", "product_id");
  if (direct) return direct;

  const product = readRecord(data, "product");
  const nested = readString(product ?? {}, "id");
  return nested || null;
}

function extractCustomerId(data: PolarRecord): string | null {
  const direct = readString(data, "customerId", "customer_id");
  if (direct) return direct;
  const customer = readRecord(data, "customer");
  return readString(customer ?? {}, "id") || null;
}

function extractSubscriptionId(data: PolarRecord): string | null {
  return (
    readString(data, "subscriptionId", "subscription_id") ||
    readString(data, "id") ||
    null
  );
}

function extractStatus(data: PolarRecord): string {
  return readString(data, "status").toLowerCase();
}

async function persistPolarFields(
  userId: string,
  fields: {
    polarCustomerId?: string;
    polarSubscriptionId?: string;
    polarSubscriptionStatus?: string;
  },
): Promise<void> {
  const col = await getUsersCollection();
  const $set: Record<string, string | Date> = { updatedAt: new Date() };
  if (fields.polarCustomerId) $set.polarCustomerId = fields.polarCustomerId;
  if (fields.polarSubscriptionId) $set.polarSubscriptionId = fields.polarSubscriptionId;
  if (fields.polarSubscriptionStatus) {
    $set.polarSubscriptionStatus = fields.polarSubscriptionStatus;
  }
  await col.updateOne({ _id: userId }, { $set });
}

export async function applyPolarSubscription(
  payload: PolarRecord,
): Promise<void> {
  const userId = extractUserId(payload);
  if (!userId) {
    console.warn("[polar] subscription event missing user id");
    return;
  }

  const user = await findUserById(userId);
  if (!user) {
    console.warn("[polar] subscription user not found:", userId);
    return;
  }

  const planId = extractPlanId(payload);
  const status = extractStatus(payload);

  await persistPolarFields(userId, {
    polarCustomerId: extractCustomerId(payload) ?? user.polarCustomerId,
    polarSubscriptionId: extractSubscriptionId(payload) ?? undefined,
    polarSubscriptionStatus: status || undefined,
  });

  if (
    planId &&
    (status === "active" ||
      status === "trialing" ||
      status === "succeeded" ||
      status === "confirmed" ||
      status === "paid")
  ) {
    await setUserPlan(userId, planId, {
      cycleAnchor:
        toDate(payload.startedAt) ??
        toDate(payload.started_at) ??
        toDate(payload.currentPeriodStart) ??
        toDate(payload.current_period_start) ??
        undefined,
    });
  }
}

export async function applyPolarCheckout(payload: PolarRecord): Promise<void> {
  const status = extractStatus(payload);
  if (status !== "succeeded" && status !== "confirmed") return;

  const userId = extractUserId(payload);
  if (userId) {
    const confirmed = await confirmUserPolarPlan(userId);
    if (confirmed.applied) return;
  }

  await applyPolarSubscription(payload);
}

export async function revokePolarSubscription(payload: PolarRecord): Promise<void> {
  const userId = extractUserId(payload);
  if (!userId) return;

  const user = await findUserById(userId);
  if (!user || user.billingExempt) return;

  await persistPolarFields(userId, {
    polarCustomerId: extractCustomerId(payload) ?? user.polarCustomerId,
    polarSubscriptionId: extractSubscriptionId(payload) ?? user.polarSubscriptionId,
    polarSubscriptionStatus: extractStatus(payload) || "canceled",
  });

  await setUserPlan(userId, "free");
}

export async function syncPolarSubscriptionUpdate(
  payload: PolarRecord,
): Promise<void> {
  const status = extractStatus(payload);
  if (
    status === "canceled" ||
    status === "revoked" ||
    status === "past_due" ||
    status === "unpaid"
  ) {
    await revokePolarSubscription(payload);
    return;
  }
  await applyPolarSubscription(payload);
}

function planRank(planId: PlanId): number {
  if (planId === "pro") return 2;
  if (planId === "plus") return 1;
  return 0;
}

export type ConfirmPolarPlanResult = {
  applied: boolean;
  planId: PlanId;
};

export async function confirmUserPolarPlan(
  userId: string,
): Promise<ConfirmPolarPlanResult> {
  const user = await findUserById(userId);
  if (!user) return { applied: false, planId: "free" };

  const current = (user.planId ?? "free") as PlanId;
  const polar = getPolarClient();
  if (!polar) return { applied: false, planId: current };

  try {
    const subsPage = await polar.subscriptions.list({
      externalCustomerId: userId,
      limit: 50,
    });
    let subscriptions = subsPage.result.items ?? [];

    if (!subscriptions.length) {
      const customersPage = await polar.customers.list({
        email: user.email,
        limit: 5,
      });
      const customer = customersPage.result.items?.[0];
      if (customer?.id) {
        const byCustomer = await polar.subscriptions.list({
          customerId: customer.id,
          limit: 50,
        });
        subscriptions = byCustomer.result.items ?? [];
      }
    }

    const active = subscriptions.filter((sub) => {
      const status = String(sub.status || "").toLowerCase();
      return status === "active" || status === "trialing";
    });

    let planId: PlanId | null = null;
    let chosen = active[0];
    for (const sub of active) {
      const next =
        planIdForPolarProduct(sub.productId) ??
        extractPlanId({
          productId: sub.productId,
          metadata: sub.metadata as PolarRecord,
        });
      if (next && planRank(next) >= planRank(planId ?? "free")) {
        planId = next;
        chosen = sub;
      }
    }

    if (!planId && active.length) {
      planId = "plus";
      chosen = active[0];
    }

    if (!planId) {
      const checkoutsPage = await polar.checkouts.list({
        externalCustomerId: userId,
        status: ["succeeded", "confirmed"],
        limit: 10,
      });
      const checkout = checkoutsPage.result.items?.[0];
      if (checkout) {
        planId = extractPlanId({
          productId: checkout.productId,
          product_id: checkout.productId,
          metadata: checkout.metadata as PolarRecord,
        });
        if (planId) {
          await persistPolarFields(userId, {
            polarCustomerId: checkout.customerId ?? user.polarCustomerId,
            polarSubscriptionStatus: "active",
          });
          await setUserPlan(userId, planId);
          return { applied: true, planId };
        }
      }
      return { applied: false, planId: current };
    }

    await persistPolarFields(userId, {
      polarCustomerId: chosen?.customerId ?? user.polarCustomerId,
      polarSubscriptionId: chosen?.id,
      polarSubscriptionStatus: chosen?.status,
    });
    await setUserPlan(userId, planId, {
      cycleAnchor:
        toDate((chosen as { startedAt?: Date }).startedAt) ??
        toDate(chosen?.currentPeriodStart) ??
        undefined,
    });
    return { applied: true, planId };
  } catch (err) {
    console.error("[polar] confirm subscription failed", err);
    return { applied: false, planId: current };
  }
}

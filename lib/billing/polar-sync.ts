import { findUserById, getUsersCollection } from "@/lib/auth/users";
import { setUserPlan } from "@/lib/billing/credits";
import type { PlanId } from "@/lib/billing/plans";
import { planIdForPolarProduct } from "@/lib/polar/config";

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

  const customer = readRecord(data, "customer");
  const external = readString(
    customer ?? {},
    "externalId",
    "external_id",
    "externalCustomerId",
  );
  return external || null;
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
  return readString(data, "id") || null;
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

  const productId = extractProductId(payload);
  const planId = productId ? planIdForPolarProduct(productId) : null;
  const status = extractStatus(payload);

  await persistPolarFields(userId, {
    polarCustomerId: extractCustomerId(payload) ?? user.polarCustomerId,
    polarSubscriptionId: extractSubscriptionId(payload) ?? undefined,
    polarSubscriptionStatus: status || undefined,
  });

  if (planId && (status === "active" || status === "trialing")) {
    await setUserPlan(userId, planId);
  }
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

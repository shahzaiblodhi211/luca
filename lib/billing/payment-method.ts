import { getUsersCollection } from "@/lib/auth/users";
import type { UserDoc } from "@/lib/auth/types";
import type { Polar } from "@polar-sh/sdk";
import type { BillingPaymentMethod } from "./types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function readString(obj: Record<string, unknown> | null, ...keys: string[]) {
  if (!obj) return "";
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return "";
}

function readNumber(obj: Record<string, unknown> | null, ...keys: string[]) {
  if (!obj) return 0;
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "number" && Number.isFinite(val)) return val;
  }
  return 0;
}

export function normalizePaymentMethod(
  value: unknown,
): BillingPaymentMethod | null {
  const rec = asRecord(value);
  if (!rec) return null;
  const meta =
    asRecord(rec.methodMetadata) ??
    asRecord(rec.method_metadata) ??
    asRecord(rec.card) ??
    rec;
  const brand = readString(meta, "brand");
  const last4 = readString(meta, "last4");
  const expMonth = readNumber(meta, "expMonth", "exp_month");
  const expYear = readNumber(meta, "expYear", "exp_year");
  if (!brand || !/^\d{4}$/.test(last4)) return null;
  return { brand, last4, expMonth, expYear };
}

async function collectPolarItems(listed: unknown): Promise<unknown[]> {
  const rec = asRecord(listed);
  const nested = asRecord(rec?.result);
  if (Array.isArray(nested?.items)) return nested.items;
  if (Array.isArray(rec?.items)) return rec.items;
  if (listed && typeof listed === "object" && Symbol.asyncIterator in listed) {
    for await (const page of listed as AsyncIterable<unknown>) {
      const pageRec = asRecord(page);
      const pageNested = asRecord(pageRec?.result);
      if (Array.isArray(pageNested?.items)) return pageNested.items;
      if (Array.isArray(pageRec?.items)) return pageRec.items;
    }
  }
  return [];
}

function pickCard(items: unknown[]): BillingPaymentMethod | null {
  const parsed = items
    .map((item) => ({
      item: asRecord(item),
      card: normalizePaymentMethod(item),
    }))
    .filter((row) => row.card);
  const preferred =
    parsed.find((row) => Boolean(row.item?.isDefault || row.item?.is_default)) ??
    parsed[0];
  return preferred?.card ?? null;
}

async function resolvePolarCustomerId(
  polar: Polar,
  user: UserDoc,
): Promise<string | undefined> {
  if (user.polarCustomerId) return user.polarCustomerId;
  try {
    const customer = await polar.customers.getExternal({
      externalId: user._id,
    });
    if (customer.id) return customer.id;
  } catch {
    /* try email */
  }
  try {
    const page = await polar.customers.list({
      email: user.email,
      limit: 5,
    });
    return page.result.items?.[0]?.id;
  } catch {
    return undefined;
  }
}

export async function saveUserPaymentMethod(
  userId: string,
  card: BillingPaymentMethod,
  polarCustomerId?: string,
): Promise<void> {
  const col = await getUsersCollection();
  await col.updateOne(
    { _id: userId },
    {
      $set: {
        paymentMethod: card,
        ...(polarCustomerId ? { polarCustomerId } : {}),
        updatedAt: new Date(),
      },
    },
  );
}

export async function loadCustomerPaymentMethod(
  polar: Polar,
  user: UserDoc,
): Promise<BillingPaymentMethod | null> {
  const customerId = await resolvePolarCustomerId(polar, user);

  try {
    const byExternal = await polar.customers.listPaymentMethodsExternal({
      externalId: user._id,
      limit: 10,
    });
    const card = pickCard(await collectPolarItems(byExternal));
    if (card) {
      await saveUserPaymentMethod(user._id, card, customerId);
      return card;
    }
  } catch (err) {
    console.warn("[billing] payment methods external", err);
  }

  if (customerId) {
    try {
      const byId = await polar.customers.listPaymentMethods({
        id: customerId,
        limit: 10,
      });
      const card = pickCard(await collectPolarItems(byId));
      if (card) {
        await saveUserPaymentMethod(user._id, card, customerId);
        return card;
      }
    } catch (err) {
      console.warn("[billing] payment methods", err);
    }
  }

  try {
    const payments = await polar.payments.list({
      ...(customerId ? { customerId } : { customerEmail: user.email }),
      method: "card",
      status: "succeeded",
      limit: 10,
    });
    const items = await collectPolarItems(payments);
    const card = pickCard(items);
    if (card) {
      await saveUserPaymentMethod(user._id, card, customerId);
      return card;
    }
  } catch (err) {
    console.warn("[billing] payments", err);
  }

  return user.paymentMethod ?? null;
}

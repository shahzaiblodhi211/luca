import { findUserById, getUsersCollection } from "@/lib/auth/users";
import { getPolarClient } from "@/lib/polar/config";
import { getPlan, type PlanId } from "./plans";
import {
  currentBillingPeriod,
  isSignupInferredAnchor,
  paidCyclePeriod,
  resolveBillingAnchor,
  toDate,
} from "./period";
import { syncUserBilling, toPublicBilling } from "./credits";
import { loadCustomerPaymentMethod } from "./payment-method";
import type {
  BillingInvoice,
  BillingOverview,
  BillingPaymentMethod,
  BillingSubscription,
} from "./types";

export async function getBillingOverview(
  userId: string,
): Promise<BillingOverview | null> {
  const doc = await syncUserBilling(userId);
  if (!doc) return null;

  const billing = toPublicBilling(doc);
  const fallbackPeriod = currentBillingPeriod(
    billing.planId !== "free" && isSignupInferredAnchor(doc)
      ? new Date()
      : resolveBillingAnchor(doc),
  );
  let subscription: BillingSubscription | null = null;
  let invoices: BillingInvoice[] = [];
  let paymentMethod: BillingPaymentMethod | null = null;

  const polar = getPolarClient();
  const user = await findUserById(userId);
  if (!polar || !user) {
    if (billing.planId !== "free" && isSignupInferredAnchor(doc)) {
      const col = await getUsersCollection();
      await col.updateOne(
        { _id: userId },
        {
          $set: {
            billingCycleAnchor: fallbackPeriod.start,
            billingPeriodKey: fallbackPeriod.key,
            updatedAt: new Date(),
          },
        },
      );
    }
    return {
      billing,
      subscription: {
        id: "",
        status: billing.planId === "free" ? "free" : "active",
        cancelAtPeriodEnd: false,
        currentPeriodStart: fallbackPeriod.start.toISOString(),
        currentPeriodEnd: fallbackPeriod.end.toISOString(),
      },
      invoices,
      paymentMethod: doc.paymentMethod ?? null,
    };
  }

  try {
    const subsPage = await polar.subscriptions.list({
      externalCustomerId: userId,
      limit: 20,
    });
    let subscriptions = subsPage.result.items ?? [];
    if (!subscriptions.length && user.polarCustomerId) {
      const byCustomer = await polar.subscriptions.list({
        customerId: user.polarCustomerId,
        limit: 20,
      });
      subscriptions = byCustomer.result.items ?? [];
    }

    const chosen =
      subscriptions.find((sub) => {
        const status = String(sub.status || "").toLowerCase();
        return status === "active" || status === "trialing";
      }) ||
      subscriptions.find((sub) => sub.id === user.polarSubscriptionId) ||
      subscriptions[0];

    if (chosen) {
      subscription = {
        id: chosen.id,
        status: String(chosen.status || ""),
        cancelAtPeriodEnd: Boolean(chosen.cancelAtPeriodEnd),
        currentPeriodStart: chosen.currentPeriodStart.toISOString(),
        currentPeriodEnd: chosen.currentPeriodEnd.toISOString(),
      };
    }
  } catch (err) {
    console.warn("[billing/overview] subscriptions", err);
  }

  try {
    const ordersPage = await polar.orders.list({
      externalCustomerId: userId,
      limit: 20,
    });
    let orders = ordersPage.result.items ?? [];
    if (!orders.length && user.polarCustomerId) {
      const byCustomer = await polar.orders.list({
        customerId: user.polarCustomerId,
        limit: 20,
      });
      orders = byCustomer.result.items ?? [];
    }

    invoices = orders
      .filter((order) => order.status !== "draft")
      .map((order) => ({
        id: order.id,
        date: order.createdAt.toISOString(),
        description:
          order.product?.name ||
          `Luca ${getPlan((user.planId ?? "free") as PlanId).name}`,
        status: order.paid ? "Paid" : String(order.status || "Open"),
        amount: order.totalAmount,
        currency: (order.currency || "usd").toUpperCase(),
        invoiceNumber: order.invoiceNumber,
      }))
      .sort((a, b) => +new Date(b.date) - +new Date(a.date));
  } catch (err) {
    console.warn("[billing/overview] orders", err);
  }

  paymentMethod =
    (await loadCustomerPaymentMethod(polar, user)) ??
    user.paymentMethod ??
    null;

  const latestPaid = [...invoices]
    .filter((invoice) => invoice.status.toLowerCase() === "paid")
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))[0];
  const purchaseAt = toDate(latestPaid?.date);
  const polarStart = toDate(subscription?.currentPeriodStart);
  const polarEnd = toDate(subscription?.currentPeriodEnd);
  const cycle =
    paidCyclePeriod({
      polarStart,
      polarEnd,
      purchaseAt,
    }) ?? fallbackPeriod;

  if (!subscription) {
    subscription = {
      id: "",
      status: billing.planId === "free" ? "free" : "active",
      cancelAtPeriodEnd: false,
      currentPeriodStart: cycle.start.toISOString(),
      currentPeriodEnd: cycle.end.toISOString(),
    };
  } else {
    subscription = {
      ...subscription,
      currentPeriodStart: cycle.start.toISOString(),
      currentPeriodEnd: cycle.end.toISOString(),
    };
  }

  const nextAnchor = purchaseAt ?? polarStart ?? cycle.start;
  const shouldFixAnchor =
    Boolean(nextAnchor) &&
    (isSignupInferredAnchor(user) ||
      !toDate(user.billingCycleAnchor) ||
      (purchaseAt &&
        toDate(user.billingCycleAnchor) &&
        purchaseAt.getTime() - toDate(user.billingCycleAnchor)!.getTime() >
          2 * 24 * 60 * 60 * 1000));

  if (shouldFixAnchor && nextAnchor) {
    const col = await getUsersCollection();
    await col.updateOne(
      { _id: userId },
      {
        $set: {
          billingCycleAnchor: nextAnchor,
          billingPeriodKey: cycle.key,
          updatedAt: new Date(),
        },
      },
    );
  }

  return { billing, subscription, invoices, paymentMethod };
}

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { findUserById } from "@/lib/auth/users";
import { setUserPlan, syncUserBilling, toPublicBilling } from "@/lib/billing";
import { getPolarClient, polarCheckoutEnabled } from "@/lib/polar/config";

export const runtime = "nodejs";

export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const doc = await findUserById(user.id);
  if (!doc) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (doc.billingExempt) {
    return NextResponse.json({
      error: "This account has unlimited usage and cannot be canceled here.",
    }, { status: 400 });
  }

  const polar = getPolarClient();
  if (polar && polarCheckoutEnabled() && doc.polarSubscriptionId) {
    try {
      await polar.subscriptions.update({
        id: doc.polarSubscriptionId,
        subscriptionUpdate: { cancelAtPeriodEnd: true },
      });
      const next = await syncUserBilling(user.id);
      return NextResponse.json({
        canceled: true,
        atPeriodEnd: true,
        billing: next ? toPublicBilling(next) : null,
        message: "Your plan stays active until the end of this billing period.",
      });
    } catch (err) {
      console.error("[billing/cancel]", err);
      return NextResponse.json(
        { error: "Could not cancel the subscription. Try again." },
        { status: 400 },
      );
    }
  }

  await setUserPlan(user.id, "free");
  const next = await syncUserBilling(user.id);
  return NextResponse.json({
    canceled: true,
    atPeriodEnd: false,
    billing: next ? toPublicBilling(next) : null,
    message: "You are on the Free plan.",
  });
}

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { appBaseUrl } from "@/lib/auth/app-url";
import {
  polarCheckoutEnabled,
  polarProductIdForPlan,
} from "@/lib/polar/config";
import type { PlanId } from "@/lib/billing/plans";
import { setUserPlan, syncUserBilling, toPublicBilling } from "@/lib/billing";

export const runtime = "nodejs";

const PAID: PlanId[] = ["plus", "pro"];

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  const base = appBaseUrl().replace(/\/$/, "");

  if (!user) {
    return NextResponse.redirect(`${base}/?auth=login&return=/billing`);
  }

  const planId = String(req.nextUrl.searchParams.get("planId") || "")
    .toLowerCase() as PlanId;

  if (planId === "free") {
    await setUserPlan(user.id, "free");
    return NextResponse.redirect(`${base}/billing?downgrade=free`);
  }

  if (!PAID.includes(planId)) {
    return NextResponse.redirect(`${base}/billing?error=invalid_plan`);
  }

  if (!polarCheckoutEnabled()) {
    if (process.env.NODE_ENV !== "production") {
      await setUserPlan(user.id, planId);
      return NextResponse.redirect(`${base}/billing?dev_plan=${planId}`);
    }
    return NextResponse.redirect(`${base}/billing?error=polar_not_configured`);
  }

  const productId = polarProductIdForPlan(planId);
  if (!productId) {
    return NextResponse.redirect(`${base}/billing?error=missing_product`);
  }

  return NextResponse.redirect(
    `${base}/checkout?plan=${planId}`,
  );
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const body = (await req.json()) as { planId?: string };
  const planId = String(body.planId || "").toLowerCase() as PlanId;

  if (planId === "free") {
    await setUserPlan(user.id, "free");
    const doc = await syncUserBilling(user.id);
    return NextResponse.json({
      billing: doc ? toPublicBilling(doc) : null,
      message: "Downgraded to Free.",
    });
  }

  if (!PAID.includes(planId)) {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }

  if (!polarCheckoutEnabled()) {
    if (process.env.NODE_ENV !== "production") {
      await setUserPlan(user.id, planId);
      const doc = await syncUserBilling(user.id);
      return NextResponse.json({
        billing: doc ? toPublicBilling(doc) : null,
        message: `Dev mode: applied ${planId} (set Polar product IDs for real checkout).`,
      });
    }
    return NextResponse.json(
      { error: "Billing is not configured yet." },
      { status: 503 },
    );
  }

  const base = appBaseUrl().replace(/\/$/, "");
  return NextResponse.json({
    checkoutUrl: `${base}/checkout?plan=${planId}`,
  });
}

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  createPolarCheckoutSession,
  isPaidPlan,
} from "@/lib/polar/create-checkout-session";
import {
  polarCheckoutEnabled,
  polarProductIdForPlan,
} from "@/lib/polar/config";
import { setUserPlan, syncUserBilling, toPublicBilling } from "@/lib/billing";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const body = (await req.json()) as { planId?: string };
  const planId = String(body.planId || "").toLowerCase();

  if (!isPaidPlan(planId)) {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }

  if (!polarCheckoutEnabled()) {
    if (process.env.NODE_ENV !== "production") {
      await setUserPlan(user.id, planId);
      const doc = await syncUserBilling(user.id);
      return NextResponse.json({
        devMode: true,
        billing: doc ? toPublicBilling(doc) : null,
        message: `Dev mode: applied ${planId}.`,
      });
    }
    return NextResponse.json(
      { error: "Billing is not configured yet." },
      { status: 503 },
    );
  }

  if (!polarProductIdForPlan(planId)) {
    return NextResponse.json(
      { error: `Product ID missing for ${planId} in env.` },
      { status: 503 },
    );
  }

  try {
    const session = await createPolarCheckoutSession(user, planId);
    if (!session) {
      return NextResponse.json(
        { error: "Could not start checkout." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      planId,
      checkoutUrl: session.url,
      clientSecret: session.clientSecret,
    });
  } catch (err) {
    console.error("[billing/session]", err);
    return NextResponse.json(
      { error: "Could not start checkout. Try again." },
      { status: 502 },
    );
  }
}

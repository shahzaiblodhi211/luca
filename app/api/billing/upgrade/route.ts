import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";

import {

  getPlan,

  setUserPlan,

  syncUserBilling,

  toPublicBilling,

  type PlanId,

} from "@/lib/billing";



export const runtime = "nodejs";



const VALID: PlanId[] = ["free", "plus", "pro"];



export async function POST(req: Request) {

  try {

    const user = await getSessionUser();

    if (!user) {

      return NextResponse.json({ error: "Sign in first." }, { status: 401 });

    }



    const body = (await req.json()) as { planId?: string };

    const planId = String(body.planId || "").toLowerCase() as PlanId;

    if (!VALID.includes(planId)) {

      return NextResponse.json({ error: "Invalid plan." }, { status: 400 });

    }



    const current = await syncUserBilling(user.id);

    if (!current) {

      return NextResponse.json({ error: "User not found" }, { status: 404 });

    }



    if (current.billingExempt) {

      const billing = toPublicBilling(current);

      return NextResponse.json({ billing, message: "Account has unlimited usage." });

    }



    const target = getPlan(planId);

    if (target.priceMonthlyUsd > 0 && process.env.NODE_ENV === "production") {

      const stripeReady = Boolean(process.env.STRIPE_SECRET_KEY?.trim());

      if (!stripeReady) {

        return NextResponse.json(

          {

            error:

              "Paid upgrades are not live yet. Contact support or use a dev environment.",

          },

          { status: 503 },

        );

      }

    }



    await setUserPlan(user.id, planId);

    const doc = await syncUserBilling(user.id);

    const billing = doc ? toPublicBilling(doc) : null;



    return NextResponse.json({

      billing,

      plan: target,

      message:

        target.priceMonthlyUsd > 0

          ? `You are now on ${target.name}. Payment integration coming soon — plan applied for testing.`

          : `You are on ${target.name}.`,

    });

  } catch (err) {

    console.error("[billing/upgrade]", err);

    return NextResponse.json(

      { error: err instanceof Error ? err.message : "Upgrade failed" },

      { status: 500 },

    );

  }

}


import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { confirmUserPolarPlan } from "@/lib/billing/polar-sync";
import { syncUserBilling, toPublicBilling } from "@/lib/billing";

export const runtime = "nodejs";

export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const result = await confirmUserPolarPlan(user.id);
  const doc = await syncUserBilling(user.id);

  return NextResponse.json({
    applied: result.applied,
    planId: result.planId,
    billing: doc ? toPublicBilling(doc) : null,
  });
}

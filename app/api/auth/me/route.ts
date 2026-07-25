import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";

import { syncUserBilling, toPublicBilling } from "@/lib/billing";



export const runtime = "nodejs";



export async function GET() {

  try {

    const user = await getSessionUser();

    if (!user) {

      return NextResponse.json({ user: null, billing: null });

    }

    const doc = await syncUserBilling(user.id);

    const billing = doc ? toPublicBilling(doc) : null;

    return NextResponse.json({ user, billing });

  } catch (err) {

    console.error("[auth/me]", err);

    return NextResponse.json({ user: null, billing: null });

  }

}


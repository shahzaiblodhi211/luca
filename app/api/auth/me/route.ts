import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";

import { syncUserBilling, toPublicBilling } from "@/lib/billing";



export const runtime = "nodejs";



export async function GET() {

  try {

    const user = await getSessionUser();

    const vercelOAuthConfigured = Boolean(
      process.env.VERCEL_CLIENT_ID?.trim() &&
        process.env.VERCEL_CLIENT_SECRET?.trim(),
    );
    const figmaOAuthConfigured = Boolean(
      process.env.FIGMA_CLIENT_ID?.trim() &&
        process.env.FIGMA_CLIENT_SECRET?.trim(),
    );

    if (!user) {
      return NextResponse.json({
        user: null,
        billing: null,
        figmaOAuthConfigured,
        vercelOAuthConfigured,
      });
    }

    const doc = await syncUserBilling(user.id);

    const billing = doc ? toPublicBilling(doc) : null;

    return NextResponse.json({
      user,
      billing,
      figmaOAuthConfigured,
      vercelOAuthConfigured,
    });

  } catch (err) {

    console.error("[auth/me]", err);

    return NextResponse.json({ user: null, billing: null });

  }

}


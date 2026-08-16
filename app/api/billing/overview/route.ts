import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getBillingOverview } from "@/lib/billing/overview";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const overview = await getBillingOverview(user.id);
  if (!overview) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  return NextResponse.json(overview);
}

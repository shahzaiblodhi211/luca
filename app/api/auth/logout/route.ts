import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  try {
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[auth/logout]", err);
    return NextResponse.json({ error: "Logout failed" }, { status: 500 });
  }
}

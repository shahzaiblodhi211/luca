import { NextResponse } from "next/server";
import {
  isValidEmail,
  normalizeEmail,
  requestPasswordReset,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string };
    const email = normalizeEmail(body.email || "");
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
    }

    const result = await requestPasswordReset(email);
    return NextResponse.json({
      ok: true,
      message:
        "If an account exists for that email, we sent a reset link.",
      // Dev convenience — never returned in production
      resetUrl: result.resetUrl,
    });
  } catch (err) {
    console.error("[auth/forgot-password]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Request failed" },
      { status: 500 },
    );
  }
}

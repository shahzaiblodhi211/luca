import { NextResponse } from "next/server";
import { isValidEmail, normalizeEmail, verifyPasswordResetCode } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string; code?: string };
    const email = normalizeEmail(body.email || "");
    const code = String(body.code || "").trim();

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
    }

    const result = await verifyPasswordResetCode(email, code);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, message: "Code verified." });
  } catch (err) {
    console.error("[auth/verify-reset-code]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Verification failed" },
      { status: 500 },
    );
  }
}

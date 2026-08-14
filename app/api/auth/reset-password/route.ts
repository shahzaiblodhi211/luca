import { NextResponse } from "next/server";
import { resetPasswordWithToken, resetPasswordWithCode } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      token?: string;
      email?: string;
      code?: string;
      password?: string;
    };
    const password = String(body.password || "");
    const token = String(body.token || "").trim();
    const email = String(body.email || "").trim();
    const code = String(body.code || "").trim();

    if (!password) {
      return NextResponse.json(
        { error: "Password is required." },
        { status: 400 },
      );
    }

    let result;
    if (token) {
      result = await resetPasswordWithToken(token, password);
    } else if (email && code) {
      result = await resetPasswordWithCode(email, code, password);
    } else {
      return NextResponse.json(
        { error: "Use the reset link or enter email and 6-digit code." },
        { status: 400 },
      );
    }
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      message: "Password updated. You can sign in now.",
    });
  } catch (err) {
    console.error("[auth/reset-password]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Reset failed" },
      { status: 500 },
    );
  }
}

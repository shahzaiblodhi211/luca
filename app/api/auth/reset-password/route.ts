import { NextResponse } from "next/server";
import { resetPasswordWithToken } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      token?: string;
      password?: string;
    };
    const token = String(body.token || "").trim();
    const password = String(body.password || "");
    if (!token) {
      return NextResponse.json(
        { error: "Reset token is required." },
        { status: 400 },
      );
    }

    const result = await resetPasswordWithToken(token, password);
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

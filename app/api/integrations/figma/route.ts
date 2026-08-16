import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { clearFigmaConnection } from "@/lib/figma-connection";
import { isFigmaOAuthConfigured } from "@/lib/figma-oauth";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({
    configured: isFigmaOAuthConfigured(),
    connected: Boolean(user?.figmaConnected),
    handle: user?.figmaHandle || null,
  });
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  await clearFigmaConnection(user.id);
  return NextResponse.json({ ok: true });
}

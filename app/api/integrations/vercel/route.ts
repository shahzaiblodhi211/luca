import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  clearVercelConnection,
  saveVercelConnection,
} from "@/lib/vercel-connection";
import { fetchVercelMe } from "@/lib/vercel-oauth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const body = (await req.json()) as { token?: string; teamId?: string };
  const token = String(body.token || "").trim();
  if (!token) {
    return NextResponse.json({ error: "Vercel token required." }, { status: 400 });
  }

  const me = await fetchVercelMe(token);
  if (!me.id && !me.username) {
    return NextResponse.json(
      { error: "That token is not valid." },
      { status: 400 },
    );
  }

  await saveVercelConnection(user.id, {
    accessToken: token,
    teamId: body.teamId,
    username: me.username,
    vercelUserId: me.id,
  });
  return NextResponse.json({ ok: true, username: me.username });
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  await clearVercelConnection(user.id);
  return NextResponse.json({ ok: true });
}

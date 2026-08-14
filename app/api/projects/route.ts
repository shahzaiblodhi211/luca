import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listProjects } from "@/lib/chats";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const projects = await listProjects(user.id);
    return NextResponse.json({ projects });
  } catch (err) {
    console.error("[projects GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list projects" },
      { status: 500 },
    );
  }
}

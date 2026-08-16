import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getChat } from "@/lib/chats";
import { buildPublishFiles } from "@/lib/preview/publish-bundle";
import {
  deployFilesToVercel,
  vercelProjectName,
} from "@/lib/preview/vercel-deploy";
import { getVercelAuthForUser } from "@/lib/vercel-connection";
import { isVercelOAuthConfigured } from "@/lib/vercel-oauth";
import type { ProjectFile } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to publish." }, { status: 401 });
  }

  const auth = await getVercelAuthForUser(user.id);
  if (!auth) {
    return NextResponse.json(
      {
        error: "Connect your Vercel account first.",
        needsConnect: true,
        oauth: isVercelOAuthConfigured(),
      },
      { status: 409 },
    );
  }

  const body = (await req.json()) as {
    chatId?: string;
    files?: ProjectFile[];
    packages?: Record<string, string>;
    imageDataUrls?: Record<string, string>;
  };

  const chatId = String(body.chatId || "").trim();
  if (!chatId) {
    return NextResponse.json({ error: "Missing chat." }, { status: 400 });
  }

  const chat = await getChat(chatId, user.id);
  if (!chat) {
    return NextResponse.json({ error: "Chat not found." }, { status: 404 });
  }

  const files = (body.files?.length ? body.files : chat.files) || [];
  if (!files.some((f) => /\.(tsx|jsx)$/.test(f.path) && f.code.trim())) {
    return NextResponse.json(
      { error: "Nothing to publish yet." },
      { status: 400 },
    );
  }

  try {
    const deployFiles = await buildPublishFiles(
      files,
      body.packages || {},
      body.imageDataUrls || {},
    );
    const deployed = await deployFilesToVercel({
      name: vercelProjectName(chatId),
      files: deployFiles,
      token: auth.token,
      teamId: auth.teamId,
    });
    return NextResponse.json({
      ok: true,
      url: deployed.url,
      id: deployed.id,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not publish to Vercel.";
    const needsToken = /token|cannot create projects/i.test(message);
    return NextResponse.json(
      {
        error: message,
        ...(needsToken ? { needsToken: true } : {}),
      },
      { status: 502 },
    );
  }
}

import { NextResponse } from "next/server";
import { resolveAttachmentMetas } from "@/lib/attachments";
import { createChat, listChats, serializeChat } from "@/lib/chats";
import { parseThinkingLevel } from "@/lib/thinking-level";

export const runtime = "nodejs";

export async function GET() {
  try {
    const chats = await listChats();
    return NextResponse.json({ chats });
  } catch (err) {
    console.error("[chats GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list chats" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      prompt?: string;
      attachmentIds?: string[];
      thinkingLevel?: string;
    };
    const prompt = body.prompt?.trim() || "";
    const attachmentIds = Array.isArray(body.attachmentIds)
      ? body.attachmentIds.filter(Boolean)
      : [];
    const thinkingLevel = parseThinkingLevel(body.thinkingLevel, "LOW");

    if (!prompt && !attachmentIds.length) {
      return NextResponse.json(
        { error: "prompt or attachments required" },
        { status: 400 },
      );
    }

    const attachments = attachmentIds.length
      ? await resolveAttachmentMetas(attachmentIds)
      : [];

    const chat = await createChat(prompt, attachments, thinkingLevel);
    return NextResponse.json({
      chat: serializeChat(chat),
    });
  } catch (err) {
    console.error("[chats POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create chat" },
      { status: 500 },
    );
  }
}

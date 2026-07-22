import { NextResponse } from "next/server";
import { deleteChat, getChat, getChatImageDataUrls, serializeChat } from "@/lib/chats";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const chat = await getChat(id);
    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }
    const imageDataUrls = await getChatImageDataUrls(chat);
    return NextResponse.json({
      chat: serializeChat(chat, imageDataUrls),
    });
  } catch (err) {
    console.error("[chat GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load chat" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ok = await deleteChat(id);
    if (!ok) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[chat DELETE]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete chat" },
      { status: 500 },
    );
  }
}

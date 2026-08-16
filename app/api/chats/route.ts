import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  assertCanSpendCredit,
  BillingError,
  capThinkingForUser,
  syncUserBilling,
  toPublicBilling,
} from "@/lib/billing";
import { resolveAttachmentMetas } from "@/lib/attachments";
import { createChat, listChats, listChatsPage, serializeChat } from "@/lib/chats";
import { parseThinkingLevel } from "@/lib/thinking-level";
import { resolveLucaModelTier } from "@/lib/luca-model-tier";
import type { PlanId } from "@/lib/billing/plans";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ chats: [], hasMore: false });
    }
    const url = new URL(req.url);
    const limitRaw = url.searchParams.get("limit");
    if (limitRaw) {
      const limit = Number(limitRaw);
      const offset = Number(url.searchParams.get("offset") || 0);
      const page = await listChatsPage(user.id, {
        limit: Number.isFinite(limit) ? limit : 10,
        offset: Number.isFinite(offset) ? offset : 0,
      });
      return NextResponse.json(page);
    }
    const chats = await listChats(user.id);
    return NextResponse.json({ chats, hasMore: false });
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
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: "Sign in to start a chat." },
        { status: 401 },
      );
    }

    const body = (await req.json()) as {
      prompt?: string;
      attachmentIds?: string[];
      thinkingLevel?: string;
      lucaModelTier?: string;
    };
    const prompt = body.prompt?.trim() || "";
    const attachmentIds = Array.isArray(body.attachmentIds)
      ? body.attachmentIds.filter(Boolean)
      : [];
    const thinkingLevelRaw = parseThinkingLevel(body.thinkingLevel, "LOW");

    if (!prompt && !attachmentIds.length) {
      return NextResponse.json(
        { error: "prompt or attachments required" },
        { status: 400 },
      );
    }

    const userDoc = await syncUserBilling(user.id);
    if (!userDoc) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    try {
      assertCanSpendCredit(userDoc);
    } catch (err) {
      if (err instanceof BillingError) {
        return NextResponse.json(
          {
            error: err.message,
            code: err.code,
            billing: toPublicBilling(userDoc),
          },
          { status: err.status },
        );
      }
      throw err;
    }

    const thinkingLevel = capThinkingForUser(userDoc, thinkingLevelRaw);
    const planId = (userDoc.planId ?? "free") as PlanId;
    const lucaModelTier = resolveLucaModelTier(planId, body.lucaModelTier);

    const attachments = attachmentIds.length
      ? await resolveAttachmentMetas(attachmentIds)
      : [];

    const chat = await createChat(
      user.id,
      prompt,
      attachments,
      thinkingLevel,
      lucaModelTier,
    );
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

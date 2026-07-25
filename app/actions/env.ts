"use server";

import {
  envLocalPath,
  mergeEnvFileContent,
  parseEnvFileContent,
} from "@/lib/agent/env-vars";
import { getSessionUser } from "@/lib/auth";
import { getChat, updateChatFiles } from "@/lib/chats";
import type { EnvRequestPart, ProjectFile } from "@/lib/types";

/**
 * Merge user-submitted secrets into the project's `.env.local`, persist on the
 * chat, and return the updated file list (client syncs preview with restart).
 */
export async function saveProjectEnvAction(input: {
  chatId: string;
  requestId: string;
  values: Record<string, string>;
}): Promise<{
  ok: boolean;
  error?: string;
  files?: ProjectFile[];
  savedKeys?: string[];
}> {
  const chatId = input.chatId?.trim();
  if (!chatId) return { ok: false, error: "chatId required" };

  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.values ?? {})) {
    const key = String(k || "")
      .trim()
      .replace(/[^\w]/g, "_")
      .toUpperCase();
    if (!key) continue;
    values[key] = String(v ?? "").trim();
  }

  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required" };

  const chat = await getChat(chatId, user.id);
  if (!chat) return { ok: false, error: "Chat not found" };

  const path = envLocalPath();
  const existing = chat.files.find((f) => f.path === path)?.code ?? "";
  const nextCode = mergeEnvFileContent(existing || `# Luca AI project env\n`, values);

  const files: ProjectFile[] = [...chat.files];
  const idx = files.findIndex((f) => f.path === path);
  const file: ProjectFile = { path, code: nextCode, language: "bash" };
  if (idx >= 0) files[idx] = file;
  else files.push(file);

  // Mark matching env_request part as saved in the latest assistant message
  const messages = [...chat.messages];
  let touched = false;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant" || !m.parts?.length) continue;
    const parts = m.parts.map((p) => {
      if (p.type !== "env_request") return p;
      if (input.requestId && p.id !== input.requestId) return p;
      touched = true;
      const part: EnvRequestPart = {
        ...p,
        status: "saved",
        savedKeys: Object.keys(values).filter((k) => Boolean(values[k])),
      };
      return part;
    });
    if (touched) {
      messages[i] = { ...m, parts };
      break;
    }
  }

  await updateChatFiles(chatId, files, chat.projectId);
  if (touched) {
    const { getChatsCollection } = await import("@/lib/mongodb");
    const col = await getChatsCollection();
    await col.updateOne(
      { _id: chatId },
      { $set: { messages, updatedAt: new Date() } },
    );
  }

  const parsed = parseEnvFileContent(nextCode);
  return {
    ok: true,
    files,
    savedKeys: Object.keys(parsed).filter((k) => Boolean(parsed[k])),
  };
}

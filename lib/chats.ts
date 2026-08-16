import { nanoid } from "nanoid";
import { getChatsCollection } from "./mongodb";
import { titleFromPrompt } from "./utils";
import type {
  AssistantPart,
  ChatAttachment,
  ChatDoc,
  ChatImageRef,
  ChatMessage,
  ChatSummary,
  ProjectFile,
  ProjectSummary,
} from "./types";
import { applyDeletedFiles, mergeProjectFiles } from "./project-files";
import {
  resolveChatTitleUpdate,
  type ChatTitleMeta,
} from "./chat-title";
import {
  applyImageUrlsToFiles,
  resolveImageJobs,
  type ImageJob,
} from "./resolve-images";
import { getImageById, toDataUrl } from "./image-store";
import { cleanupChatPreview } from "./preview/cleanup-chat";

function toChatSummary(d: {
  _id: string;
  title: string;
  projectId?: string | null;
  files?: unknown;
  createdAt: Date;
  updatedAt: Date;
}): ChatSummary {
  const hasFiles = Array.isArray(d.files) && d.files.length > 0;
  const projectId =
    typeof d.projectId === "string" && d.projectId.trim()
      ? d.projectId.trim()
      : null;
  return {
    id: d._id,
    title: d.title,
    createdAt: new Date(d.createdAt).toISOString(),
    updatedAt: new Date(d.updatedAt).toISOString(),
    projectId,
    hasProject: hasFiles || Boolean(projectId),
  };
}

export async function listChats(
  userId: string,
  limit = 10,
): Promise<ChatSummary[]> {
  const page = await listChatsPage(userId, { limit, offset: 0 });
  return page.chats;
}

export async function listChatsPage(
  userId: string,
  opts?: { limit?: number; offset?: number },
): Promise<{ chats: ChatSummary[]; hasMore: boolean }> {
  if (!userId) return { chats: [], hasMore: false };
  const limit = Math.min(Math.max(opts?.limit ?? 10, 1), 40);
  const offset = Math.max(opts?.offset ?? 0, 0);
  const col = await getChatsCollection();
  const docs = await col
    .find(
      { userId },
      {
        projection: {
          title: 1,
          projectId: 1,
          files: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    )
    .sort({ updatedAt: -1 })
    .skip(offset)
    .limit(limit + 1)
    .toArray();

  const hasMore = docs.length > limit;
  return {
    chats: docs.slice(0, limit).map(toChatSummary),
    hasMore,
  };
}

/** Chats where Luca generated code files (real projects only). */
export async function listProjects(
  userId: string,
  limit = 100,
): Promise<ProjectSummary[]> {
  if (!userId) return [];
  const col = await getChatsCollection();
  const docs = await col
    .find(
      {
        userId,
        "files.0": { $exists: true },
      },
      {
        projection: {
          title: 1,
          projectId: 1,
          files: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    )
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map((d) => ({
    id: d._id,
    title: d.title,
    projectId: d.projectId ?? null,
    fileCount: Array.isArray(d.files) ? d.files.length : 0,
    createdAt: new Date(d.createdAt).toISOString(),
    updatedAt: new Date(d.updatedAt).toISOString(),
  }));
}

/** Load a chat by id. Pass userId to enforce ownership. */
export async function getChat(
  id: string,
  userId?: string,
): Promise<ChatDoc | null> {
  const col = await getChatsCollection();
  if (userId) {
    return col.findOne({ _id: id, userId });
  }
  return col.findOne({ _id: id });
}

export async function createChat(
  userId: string,
  prompt: string,
  attachments: ChatAttachment[] = [],
  thinkingLevel?: string,
  lucaModelTier?: string,
): Promise<ChatDoc> {
  if (!userId) throw new Error("userId required");
  const col = await getChatsCollection();
  const now = new Date();
  const content =
    prompt.trim() ||
    (attachments.length
      ? `Please use the uploaded file${attachments.length > 1 ? "s" : ""}.`
      : "");
  const userMessage: ChatMessage = {
    id: nanoid(),
    role: "user",
    content,
    attachments: attachments.length ? attachments : undefined,
    createdAt: now,
  };

  const doc: ChatDoc = {
    _id: nanoid(),
    userId,
    title: titleFromPrompt(content || attachments[0]?.name || "New chat"),
    titleAiUpdates: 0,
    messages: [userMessage],
    projectId: null,
    files: [],
    packages: {},
    images: [],
    attachments,
    thinkingLevel: thinkingLevel || undefined,
    lucaModelTier: lucaModelTier || undefined,
    createdAt: now,
    updatedAt: now,
  };

  await col.insertOne(doc);
  return doc;
}

export async function setChatThinkingLevel(
  chatId: string,
  thinkingLevel: string,
): Promise<void> {
  const col = await getChatsCollection();
  await col.updateOne(
    { _id: chatId },
    { $set: { thinkingLevel, updatedAt: new Date() } },
  );
}

export async function setChatLucaModelTier(
  chatId: string,
  lucaModelTier: string,
): Promise<void> {
  const col = await getChatsCollection();
  await col.updateOne(
    { _id: chatId },
    { $set: { lucaModelTier, updatedAt: new Date() } },
  );
}

export async function setChatTitle(
  chatId: string,
  title: string,
  meta?: ChatTitleMeta,
): Promise<void> {
  const col = await getChatsCollection();
  await col.updateOne(
    { _id: chatId },
    {
      $set: {
        title,
        updatedAt: new Date(),
        ...(meta?.titleAiUpdates !== undefined
          ? { titleAiUpdates: meta.titleAiUpdates }
          : {}),
        ...(meta?.firstPromptGreeting !== undefined
          ? { firstPromptGreeting: meta.firstPromptGreeting }
          : {}),
      },
    },
  );
}

/** AI chat title: greeting on first prompt, one rename when intent appears. */
export async function maybeUpdateChatTitle(
  chatId: string,
  chat: ChatDoc,
  latestUserMessage: string,
): Promise<string | null> {
  const userMessages = chat.messages
    .filter((m) => m.role === "user")
    .map((m) => m.content);

  const patch = await resolveChatTitleUpdate({
    titleAiUpdates: chat.titleAiUpdates,
    firstPromptGreeting: chat.firstPromptGreeting,
    userMessages,
    latestUserMessage,
  });
  if (!patch || patch.title === chat.title) return null;

  await setChatTitle(chatId, patch.title, {
    titleAiUpdates: patch.titleAiUpdates,
    firstPromptGreeting: patch.firstPromptGreeting,
  });
  return patch.title;
}

/** Attach clone screenshots (etc.) to the latest user message for chat UI. */
export async function appendAttachmentsToLastUserMessage(
  chatId: string,
  attachments: ChatAttachment[],
): Promise<ChatDoc | null> {
  if (!attachments.length) return getChat(chatId);

  const col = await getChatsCollection();
  const existing = await col.findOne({ _id: chatId });
  if (!existing?.messages?.length) return existing;

  const messages = [...existing.messages];
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx < 0) return existing;

  const prev = messages[lastUserIdx];
  const mergedMsgAttachments = [
    ...(prev.attachments ?? []),
    ...attachments.filter(
      (a) => !(prev.attachments ?? []).some((e) => e.id === a.id),
    ),
  ];
  messages[lastUserIdx] = {
    ...prev,
    attachments: mergedMsgAttachments,
  };

  const chatAttachments = [
    ...(existing.attachments ?? []),
    ...attachments.filter(
      (a) => !(existing.attachments ?? []).some((e) => e.id === a.id),
    ),
  ];

  const result = await col.findOneAndUpdate(
    { _id: chatId },
    {
      $set: {
        messages,
        attachments: chatAttachments,
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  );

  return result ?? null;
}

export async function appendUserMessage(
  chatId: string,
  content: string,
  attachments: ChatAttachment[] = [],
): Promise<ChatDoc | null> {
  const col = await getChatsCollection();
  const existing = await col.findOne({ _id: chatId });
  if (!existing) return null;

  const now = new Date();
  const text =
    content.trim() ||
    (attachments.length
      ? `Please use the uploaded file${attachments.length > 1 ? "s" : ""}.`
      : "");
  const message: ChatMessage = {
    id: nanoid(),
    role: "user",
    content: text,
    attachments: attachments.length ? attachments : undefined,
    createdAt: now,
  };

  const mergedAttachments = [
    ...(existing.attachments ?? []),
    ...attachments.filter(
      (a) => !(existing.attachments ?? []).some((e) => e.id === a.id),
    ),
  ];

  const result = await col.findOneAndUpdate(
    { _id: chatId },
    {
      $push: { messages: message },
      $set: {
        updatedAt: now,
        attachments: mergedAttachments,
      },
    },
    { returnDocument: "after" },
  );

  return result ?? null;
}

function mergeImageRefs(
  existing: ChatImageRef[],
  incoming: ChatImageRef[],
): ChatImageRef[] {
  const map = new Map(existing.map((img) => [img.path, img]));
  for (const img of incoming) {
    map.set(img.path, img);
  }
  return Array.from(map.values());
}

function rewriteFilesWithImagePaths(
  files: ProjectFile[],
  images: ChatImageRef[],
  dataUrls: Record<string, string>,
): ProjectFile[] {
  // Prefer /api/images/{id} in source; preview uses dataUrls separately
  const liveMap: Record<string, string> = {};
  for (const img of images) {
    const live =
      (img.url?.startsWith("/api/images/") || img.url?.startsWith("http")
        ? img.url
        : undefined) ||
      (dataUrls[img.path]?.startsWith("/api/images/")
        ? dataUrls[img.path]
        : undefined) ||
      img.path;
    liveMap[img.path] = live;
    liveMap[img.path.replace(/^\//, "")] = live;
    liveMap[`public${img.path.startsWith("/") ? img.path : `/${img.path}`}`] =
      live;
  }

  let next = applyImageUrlsToFiles(files, liveMap);

  next = next.map((file) => {
    let code = file.code;
    for (const img of images) {
      const live = liveMap[img.path] || img.path;
      const q = encodeURIComponent(img.query);
      const replacements = [
        [`/placeholder.svg?height=800&width=1200&query=${img.query}`, live],
        [`/placeholder.svg?query=${img.query}`, live],
        [`/api/generate-image?query=${q}`, live],
        [`/api/generate-image?query=${img.query}`, live],
      ] as const;
      for (const [from, to] of replacements) {
        code = code.split(from).join(to);
      }
      const re = new RegExp(
        `/placeholder\\.svg\\?[^"'\\)\\s]*query=${img.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^"'\\)\\s]*`,
        "gi",
      );
      code = code.replace(re, live);
    }
    return { ...file, code };
  });

  return next;
}

export type AssistantSavePayload = {
  content: string;
  parts?: AssistantPart[];
  projectId?: string | null;
  files?: ProjectFile[];
  deleted?: string[];
  packages?: Record<string, string>;
  imageJobs?: ImageJob[];
};

export async function appendAssistantMessage(
  chatId: string,
  payload: AssistantSavePayload | string,
): Promise<ChatDoc | null> {
  const col = await getChatsCollection();
  const existing = await col.findOne({ _id: chatId });
  if (!existing) return null;

  const data: AssistantSavePayload =
    typeof payload === "string" ? { content: payload } : payload;

  let newImages: ChatImageRef[] = [];
  let dataUrls: Record<string, string> = {};

  if (data.imageJobs?.length) {
    try {
      const resolved = await resolveImageJobs(data.imageJobs);
      newImages = resolved.images;
      dataUrls = resolved.dataUrls;
    } catch (err) {
      console.error("[images] resolve failed, saving without images", err);
    }
  }

  const now = new Date();
  const message: ChatMessage = {
    id: nanoid(),
    role: "assistant",
    content: data.content || "",
    parts: data.parts,
    createdAt: now,
  };

  const incomingFiles = data.files ?? [];
  let mergedFiles = incomingFiles.length
    ? mergeProjectFiles(existing.files ?? [], incomingFiles)
    : existing.files ?? [];

  if (data.deleted?.length) {
    mergedFiles = applyDeletedFiles(mergedFiles, data.deleted);
  }

  const mergedImages = mergeImageRefs(existing.images ?? [], newImages);
  if (mergedImages.length) {
    mergedFiles = rewriteFilesWithImagePaths(
      mergedFiles,
      mergedImages,
      dataUrls,
    );
  }

  const projectId = data.projectId ?? existing.projectId;
  const mergedPackages = {
    ...(existing.packages ?? {}),
    ...(data.packages ?? {}),
  };

  const result = await col.findOneAndUpdate(
    { _id: chatId },
    {
      $push: { messages: message },
      $set: {
        updatedAt: now,
        files: mergedFiles,
        images: mergedImages,
        packages: mergedPackages,
        ...(projectId ? { projectId } : {}),
      },
    },
    { returnDocument: "after" },
  );

  return result ?? null;
}

export async function deleteChat(
  id: string,
  userId: string,
): Promise<boolean> {
  if (!userId) return false;
  const col = await getChatsCollection();
  const result = await col.deleteOne({ _id: id, userId });
  if (result.deletedCount > 0) {
    await cleanupChatPreview(id);
    return true;
  }
  return false;
}

export async function updateChatFiles(
  chatId: string,
  files: ProjectFile[],
  projectId?: string | null,
): Promise<void> {
  const col = await getChatsCollection();
  await col.updateOne(
    { _id: chatId },
    {
      $set: {
        files,
        updatedAt: new Date(),
        ...(projectId !== undefined ? { projectId } : {}),
      },
    },
  );
}

export async function getChatImageDataUrls(
  chat: ChatDoc,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const images = chat.images ?? [];
  await Promise.all(
    images.map(async (img) => {
      // External https only — Imagen assets are Mongo-backed via img.id
      if (img.url?.startsWith("http") && !img.url.includes("/api/images/")) {
        out[img.path] = img.url;
        out[img.path.replace(/^\//, "")] = img.url;
        if (img.path.startsWith("/images/")) {
          out[`public${img.path}`] = img.url;
        }
        return;
      }
      const stored = await getImageById(img.id);
      if (!stored) return;
      const dataUrl = toDataUrl(stored);
      out[img.path] = dataUrl;
      out[img.path.replace(/^\//, "")] = dataUrl;
      if (img.path.startsWith("/images/")) {
        out[`public${img.path}`] = dataUrl;
      }
    }),
  );

  const uploaded = (chat.attachments ?? []).filter((a) => a.kind === "image");
  if (uploaded.length) {
    const { getAttachment } = await import("./attachments");
    await Promise.all(
      uploaded.map(async (att) => {
        const stored = await getAttachment(att.id);
        if (!stored) return;
        const dataUrl = `data:${stored.mimeType};base64,${stored.base64}`;
        out[att.url] = dataUrl;
        const safeName = att.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        out[`/images/${safeName}`] = dataUrl;
        out[`images/${safeName}`] = dataUrl;
        out[`public/images/${safeName}`] = dataUrl;
      }),
    );
  }

  return out;
}

export function serializeChat(
  chat: ChatDoc,
  imageDataUrls?: Record<string, string>,
) {
  return {
    id: chat._id,
    title: chat.title,
    messages: chat.messages,
    projectId: chat.projectId,
    files: chat.files,
    packages: chat.packages ?? {},
    images: chat.images ?? [],
    attachments: chat.attachments ?? [],
    thinkingLevel: chat.thinkingLevel ?? null,
    lucaModelTier: chat.lucaModelTier ?? null,
    imageDataUrls: imageDataUrls ?? {},
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  };
}

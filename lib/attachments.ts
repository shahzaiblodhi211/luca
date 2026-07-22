import { nanoid } from "nanoid";
import { getDb } from "./mongodb";
import type {
  AttachmentKind,
  ChatAttachment,
  StoredAttachment,
} from "./types";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 6;

const IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

const TEXT_MIME = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/css",
  "text/html",
  "application/json",
  "application/javascript",
  "text/javascript",
  "application/typescript",
  "text/typescript",
  "application/xml",
  "text/xml",
]);

const TEXT_EXT = new Set([
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".css",
  ".html",
  ".htm",
  ".svg",
  ".xml",
  ".yml",
  ".yaml",
  ".env",
  ".py",
  ".sql",
  ".sh",
]);

export function getAttachmentLimits() {
  return { maxBytes: MAX_BYTES, maxFiles: MAX_FILES };
}

export async function getAttachmentsCollection() {
  const db = await getDb();
  return db.collection<StoredAttachment>("attachments");
}

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export function classifyAttachment(
  name: string,
  mimeType: string,
): AttachmentKind {
  const mime = mimeType.toLowerCase();
  if (IMAGE_MIME.has(mime) || mime.startsWith("image/")) return "image";
  if (TEXT_MIME.has(mime) || TEXT_EXT.has(extOf(name))) return "text";
  return "file";
}

export function isAllowedAttachment(name: string, mimeType: string, size: number) {
  if (size <= 0 || size > MAX_BYTES) return false;
  const kind = classifyAttachment(name, mimeType);
  if (kind === "image" || kind === "text") return true;
  // allow common docs as opaque files (Gemini gets a note + name)
  const ext = extOf(name);
  return [".pdf", ".zip", ".doc", ".docx"].includes(ext);
}

export function toChatAttachment(doc: StoredAttachment): ChatAttachment {
  return {
    id: doc._id,
    name: doc.name,
    mimeType: doc.mimeType,
    size: doc.size,
    kind: doc.kind,
    url: `/api/attachments/${doc._id}`,
  };
}

export async function saveAttachment(input: {
  name: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
  /** Skip square resize — keep tall full-page clone screenshots intact. */
  preserveAspect?: boolean;
}): Promise<ChatAttachment> {
  if (!isAllowedAttachment(input.name, input.mimeType, input.size)) {
    throw new Error(`Unsupported or too large file: ${input.name}`);
  }

  const kind = classifyAttachment(input.name, input.mimeType);
  let buffer = input.buffer;
  let mimeType = input.mimeType || "application/octet-stream";
  let name = input.name;
  let textContent: string | undefined;
  const isCloneShot = /^clone-screenshot/i.test(name) || input.preserveAspect;

  if (kind === "image" && !mimeType.includes("svg")) {
    try {
      if (isCloneShot) {
        // Width-only resize — never squash a full-page shot into 1280×1280
        const { prepareScreenshotForChat } = await import("./site-screenshot");
        const prepared = await prepareScreenshotForChat(
          buffer.toString("base64"),
        );
        buffer = prepared.buffer;
        mimeType = prepared.mimeType;
        name = name.replace(/\.\w+$/, "") + ".jpg";
      } else {
        const { optimizeImageForVision } = await import("./image-optimize");
        const optimized = await optimizeImageForVision(buffer, {
          maxEdge: 1280,
          quality: 72,
        });
        buffer = optimized.buffer;
        mimeType = optimized.mimeType;
        if (mimeType === "image/jpeg" && !/\.jpe?g$/i.test(name)) {
          name = name.replace(/\.\w+$/, "") + ".jpg";
        }
      }
    } catch (err) {
      console.warn("[attachments] image optimize failed, using original", err);
    }
  }

  if (kind === "text") {
    textContent = buffer.toString("utf8").slice(0, 120_000);
  }

  const doc: StoredAttachment = {
    _id: nanoid(),
    name,
    mimeType,
    size: buffer.byteLength,
    kind,
    base64: buffer.toString("base64"),
    textContent,
    createdAt: new Date(),
  };

  const col = await getAttachmentsCollection();
  await col.insertOne(doc);
  return toChatAttachment(doc);
}

export async function getAttachment(id: string): Promise<StoredAttachment | null> {
  const col = await getAttachmentsCollection();
  return col.findOne({ _id: id });
}

export async function getAttachmentsByIds(
  ids: string[],
): Promise<StoredAttachment[]> {
  if (!ids.length) return [];
  const col = await getAttachmentsCollection();
  return col.find({ _id: { $in: ids } }).toArray();
}

export async function resolveAttachmentMetas(
  ids: string[],
): Promise<ChatAttachment[]> {
  const docs = await getAttachmentsByIds(ids);
  const map = new Map(docs.map((d) => [d._id, d]));
  return ids
    .map((id) => map.get(id))
    .filter((d): d is StoredAttachment => Boolean(d))
    .map(toChatAttachment);
}

import { createHash } from "crypto";
import { getDb } from "./mongodb";
import type { StoredImage } from "./types";

export function hashImageQuery(query: string): string {
  return createHash("sha256").update(query.trim().toLowerCase()).digest("hex").slice(0, 24);
}

export async function getImagesCollection() {
  const db = await getDb();
  const col = db.collection<StoredImage>("images");
  await col.createIndex({ hash: 1 }, { unique: true });
  return col;
}

export async function getImageById(id: string): Promise<StoredImage | null> {
  const col = await getImagesCollection();
  return col.findOne({ _id: id });
}

export async function getImageByHash(hash: string): Promise<StoredImage | null> {
  const col = await getImagesCollection();
  return col.findOne({ hash });
}

export async function saveImage(input: {
  query: string;
  mimeType: string;
  base64: string;
  path?: string;
}): Promise<StoredImage> {
  const col = await getImagesCollection();
  const hash = hashImageQuery(input.query);
  const existing = await col.findOne({ hash });
  if (existing) return existing;

  const doc: StoredImage = {
    _id: hash,
    hash,
    query: input.query.trim(),
    mimeType: input.mimeType,
    base64: input.base64,
    path: input.path,
    createdAt: new Date(),
  };

  try {
    await col.insertOne(doc);
    return doc;
  } catch {
    const again = await col.findOne({ hash });
    if (again) return again;
    throw new Error("Failed to save generated image");
  }
}

export function toDataUrl(image: Pick<StoredImage, "mimeType" | "base64">): string {
  return `data:${image.mimeType};base64,${image.base64}`;
}

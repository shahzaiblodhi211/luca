import sharp from "sharp";

export type OptimizedImage = {
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
};

/** Compress/resize images so Gemini vision is fast */
export async function optimizeImageForVision(
  input: Buffer,
  opts?: { maxEdge?: number; quality?: number },
): Promise<OptimizedImage> {
  const maxEdge = opts?.maxEdge ?? 1280;
  const quality = opts?.quality ?? 72;

  const image = sharp(input, { failOn: "none" }).rotate();
  const meta = await image.metadata();
  const width = meta.width || maxEdge;
  const height = meta.height || maxEdge;

  let pipeline = image;
  if (width > maxEdge || height > maxEdge) {
    pipeline = pipeline.resize({
      width: maxEdge,
      height: maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  // Prefer JPEG for photos (smaller/faster). Keep PNG for transparency/screenshots with alpha.
  const hasAlpha = Boolean(meta.hasAlpha);
  if (hasAlpha) {
    const buffer = await pipeline.png({ compressionLevel: 8, palette: true }).toBuffer();
    const out = await sharp(buffer).metadata();
    return {
      buffer,
      mimeType: "image/png",
      width: out.width || width,
      height: out.height || height,
    };
  }

  const buffer = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
  const out = await sharp(buffer).metadata();
  return {
    buffer,
    mimeType: "image/jpeg",
    width: out.width || width,
    height: out.height || height,
  };
}

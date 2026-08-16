import { requestPexelsImage } from "./pexels-image";

export type ImageKind = "photo" | "logo" | "illustration";

export type GeneratedImageBytes = {
  mimeType: string;
  base64: string;
  source: "pexels";
  model: string;
  /** Direct hotlink URL on the Pexels CDN. */
  directUrl?: string;
  attribution?: string;
};

const ASPECTS = new Set(["1:1", "3:4", "4:3", "9:16", "16:9"]);

export function normalizeAspect(
  aspectHint?: string,
  kind: ImageKind = "photo",
): string {
  const raw = (aspectHint || "").trim();
  if (ASPECTS.has(raw)) return raw;
  if (kind === "logo") return "1:1";
  if (/portrait|vertical|9:16/i.test(raw)) return "9:16";
  if (/square|1:1|icon|avatar|logo/i.test(raw)) return "1:1";
  if (/4:3/.test(raw)) return "4:3";
  if (/3:4/.test(raw)) return "3:4";
  return "16:9";
}

/**
 * Stock-only image pipeline: every image is a real Pexels photo.
 * AI image generation is disabled — logos are hand-written SVG assets.
 */
export async function generateImagenImage(
  query: string,
  opts?: {
    aspectHint?: string;
    kind?: ImageKind;
  },
): Promise<GeneratedImageBytes> {
  const kind = opts?.kind || "photo";
  if (kind === "logo") {
    throw new Error(
      "Logo generation is disabled — write the brand mark as an SVG file instead",
    );
  }

  const aspect = normalizeAspect(opts?.aspectHint, kind);
  const q = kind === "illustration" ? `${query} illustration` : query;
  const pexels = await requestPexelsImage(q, { kind: "photo", aspect });
  return {
    mimeType: pexels.mimeType,
    base64: pexels.base64,
    source: "pexels",
    model: pexels.model,
    directUrl: pexels.directUrl,
    attribution: pexels.attribution,
  };
}

/** @deprecated Prefer generateImagenImage — kept for route compatibility. */
export async function generateGeminiImage(
  query: string,
  aspectHint?: string,
  kind?: ImageKind,
): Promise<GeneratedImageBytes> {
  return generateImagenImage(query, { aspectHint, kind });
}

import { hasPexelsKey, requestPexelsImage } from "./pexels-image";

export type ImageKind = "photo" | "logo" | "illustration";

export type GeneratedImageBytes = {
  mimeType: string;
  base64: string;
  source: "imagen" | "gemini" | "pexels" | "pollinations";
  model: string;
  /** Set when fetched from a stock CDN (Pexels). */
  directUrl?: string;
  attribution?: string;
};

export type ImageProviderMode = "pexels" | "auto" | "pollinations";

/**
 * Default `auto`: photos → Pexels (if key) else Pollinations; logos/illustrations → Pollinations.
 * No Gemini image models — the account has no access to them.
 */
export function getImageProvider(): ImageProviderMode {
  const raw = (process.env.IMAGE_PROVIDER || "auto").trim().toLowerCase();
  if (raw === "pexels" || raw === "stock") return "pexels";
  if (raw === "pollinations") return "pollinations";
  return "auto";
}

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

function aspectToSize(aspect: string): { width: number; height: number } {
  switch (aspect) {
    case "1:1":
      return { width: 1024, height: 1024 };
    case "9:16":
      return { width: 768, height: 1344 };
    case "3:4":
      return { width: 768, height: 1024 };
    case "4:3":
      return { width: 1024, height: 768 };
    case "16:9":
    default:
      return { width: 1280, height: 720 };
  }
}

function buildPrompt(
  query: string,
  kind: ImageKind,
  aspect: string,
): string {
  const q = query.trim();
  if (kind === "logo") {
    return [
      "Professional brand logo mark, clean vector-like shapes, crisp edges,",
      "high contrast, centered, no mockup, no watermark, no extra text.",
      `Aspect ${aspect}.`,
      q,
    ].join(" ");
  }
  if (kind === "illustration") {
    return [
      "Polished illustration for a modern product website,",
      "no watermark, no UI chrome.",
      `Aspect ${aspect}.`,
      q,
    ].join(" ");
  }
  return [
    "High-quality photorealistic photo for a modern website,",
    "no text overlay, no watermark, no border.",
    `Aspect ${aspect}.`,
    q,
  ].join(" ");
}

async function requestPollinationsImage(
  query: string,
  opts: { kind: ImageKind; aspect: string },
): Promise<GeneratedImageBytes> {
  const prompt = buildPrompt(query, opts.kind, opts.aspect);
  const { width, height } = aspectToSize(opts.aspect);
  const model = process.env.POLLINATIONS_MODEL?.trim() || "flux";

  const url = new URL(
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`,
  );
  url.searchParams.set("width", String(width));
  url.searchParams.set("height", String(height));
  url.searchParams.set("nologo", "true");
  url.searchParams.set("model", model);
  url.searchParams.set("enhance", opts.kind === "photo" ? "true" : "false");
  url.searchParams.set("seed", String(Date.now() % 1_000_000));

  console.info(`[image] pollinations model=${model} kind=${opts.kind}`);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "image/*" },
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw new Error(
      `Pollinations ${response.status}: ${bodyText.slice(0, 200) || response.statusText}`,
    );
  }

  const mimeType = response.headers.get("content-type") || "image/jpeg";
  if (!mimeType.startsWith("image/")) {
    throw new Error("Pollinations returned non-image payload");
  }

  const buf = Buffer.from(await response.arrayBuffer());
  if (buf.length < 500) {
    throw new Error("Pollinations returned an empty/too-small image");
  }

  return {
    mimeType: mimeType.split(";")[0].trim() || "image/jpeg",
    base64: buf.toString("base64"),
    source: "pollinations",
    model: `pollinations:${model}`,
  };
}

async function generatePhotoAuto(
  query: string,
  dims: { kind: ImageKind; aspect: string },
): Promise<GeneratedImageBytes> {
  if (hasPexelsKey()) {
    try {
      const pexels = await requestPexelsImage(query, dims);
      return {
        mimeType: pexels.mimeType,
        base64: pexels.base64,
        source: "pexels",
        model: pexels.model,
        directUrl: pexels.directUrl,
        attribution: pexels.attribution,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[image] pexels failed (${msg.slice(0, 120)}) — pollinations fallback`,
      );
    }
  }

  return requestPollinationsImage(query, dims);
}

export async function generateImagenImage(
  query: string,
  opts?: {
    aspectHint?: string;
    kind?: ImageKind;
  },
): Promise<GeneratedImageBytes> {
  const kind = opts?.kind || "photo";
  const aspect = normalizeAspect(opts?.aspectHint, kind);
  const dims = { kind, aspect };
  const provider = getImageProvider();

  if (provider === "pollinations") {
    return requestPollinationsImage(query, dims);
  }

  if (provider === "pexels" && kind === "photo") {
    const pexels = await requestPexelsImage(query, dims);
    return {
      mimeType: pexels.mimeType,
      base64: pexels.base64,
      source: "pexels",
      model: pexels.model,
      directUrl: pexels.directUrl,
      attribution: pexels.attribution,
    };
  }

  // auto — logos/illustrations always via Pollinations; photos prefer Pexels
  if (kind === "logo" || kind === "illustration") {
    return requestPollinationsImage(query, dims);
  }

  return generatePhotoAuto(query, dims);
}

/** @deprecated Prefer generateImagenImage — kept for route compatibility. */
export async function generateGeminiImage(
  query: string,
  aspectHint?: string,
  kind?: ImageKind,
): Promise<GeneratedImageBytes> {
  return generateImagenImage(query, { aspectHint, kind });
}

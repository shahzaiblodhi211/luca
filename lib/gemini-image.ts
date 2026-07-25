import {
  getGeminiKeys,
  hasAvailableGeminiKey,
  isCapacityMessage,
  isDailyQuotaMessage,
  isRateLimitMessage,
  isRetryableGeminiError,
  isRetryableGeminiMessage,
  markGeminiKeyHot,
  noteGeminiKeySuccess,
  parseGeminiStatus,
  pickGeminiKeyIndex,
  releaseGeminiKey,
} from "./gemini-keys";

export type ImageKind = "photo" | "logo" | "illustration";

export type GeneratedImageBytes = {
  mimeType: string;
  base64: string;
  source: "imagen" | "gemini" | "pollinations";
  model: string;
};

/**
 * Free AI Studio keys usually have no usable Imagen / Nano Banana quota.
 * Default provider is Pollinations (no Google image model required).
 * Set IMAGE_PROVIDER=gemini to force Gemini native image models.
 */
export function getImageProvider(): "pollinations" | "gemini" | "auto" {
  const raw = (process.env.IMAGE_PROVIDER || "pollinations").trim().toLowerCase();
  if (raw === "gemini" || raw === "google" || raw === "imagen") return "gemini";
  if (raw === "auto") return "auto";
  return "pollinations";
}

/** @deprecated name kept for callers — returns configured Gemini image model. */
export function getImagenModel(): string {
  return (
    process.env.IMAGEN_MODEL?.trim() ||
    process.env.GEMINI_IMAGE_MODEL?.trim() ||
    "gemini-2.5-flash-image"
  );
}

function geminiImageModels(): string[] {
  const primary = getImagenModel();
  const envList = (process.env.GEMINI_IMAGE_MODELS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(
    new Set([primary, ...envList, "gemini-2.5-flash-image"].filter(Boolean)),
  );
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

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: { mimeType?: string; data?: string };
        inline_data?: { mime_type?: string; data?: string };
      }>;
    };
  }>;
  error?: { message?: string; code?: number; status?: string };
};

function isModelUnavailableError(message: string): boolean {
  return (
    /\b404\b/.test(message) ||
    /no longer available|not found|not supported|is not found for API version|not available to new users|not supported for predict/i.test(
      message,
    )
  );
}

/** Free text-to-image — no Google image-model quota required. */
async function requestPollinationsImage(
  query: string,
  opts: { kind: ImageKind; aspect: string },
): Promise<GeneratedImageBytes> {
  const prompt = buildPrompt(query, opts.kind, opts.aspect);
  const { width, height } = aspectToSize(opts.aspect);
  const model =
    process.env.POLLINATIONS_MODEL?.trim() ||
    (opts.kind === "logo" || opts.kind === "illustration" ? "flux" : "flux");

  const url = new URL(
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`,
  );
  url.searchParams.set("width", String(width));
  url.searchParams.set("height", String(height));
  url.searchParams.set("nologo", "true");
  url.searchParams.set("model", model);
  url.searchParams.set("enhance", opts.kind === "photo" ? "true" : "false");
  // cache-bust so identical prompts still refresh when needed
  url.searchParams.set("seed", String(Date.now() % 1_000_000));

  console.info(
    `[image] pollinations model=${model} kind=${opts.kind} aspect=${opts.aspect} ${width}x${height}`,
  );

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
    const bodyText = await response.text().catch(() => "");
    throw new Error(
      `Pollinations returned non-image (${mimeType}): ${bodyText.slice(0, 160)}`,
    );
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

async function requestGeminiNativeImage(
  apiKey: string,
  model: string,
  query: string,
  opts: { kind: ImageKind; aspect: string },
): Promise<GeneratedImageBytes> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: buildPrompt(query, opts.kind, opts.aspect) }],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio: opts.aspect },
      },
    }),
  });

  const bodyText = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(
      `Gemini image ${response.status}: ${bodyText.slice(0, 400) || response.statusText}`,
    );
  }

  let json: GeminiGenerateResponse;
  try {
    json = JSON.parse(bodyText) as GeminiGenerateResponse;
  } catch {
    throw new Error(`Gemini image invalid JSON: ${bodyText.slice(0, 200)}`);
  }

  if (json.error) {
    throw new Error(
      `Gemini image ${json.error.code ?? 500}: ${json.error.message || json.error.status || "failed"}`,
    );
  }

  const parts = json.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    const mime =
      part.inlineData?.mimeType || part.inline_data?.mime_type || "";
    const data = part.inlineData?.data || part.inline_data?.data || "";
    if (data) {
      return {
        mimeType: mime || "image/png",
        base64: data.replace(/^data:[^;]+;base64,/, ""),
        source: "gemini",
        model,
      };
    }
  }

  throw new Error("Gemini image response contained no image bytes");
}

async function generateViaGemini(
  query: string,
  opts: { kind: ImageKind; aspect: string },
): Promise<GeneratedImageBytes> {
  const models = geminiImageModels();
  const keys = getGeminiKeys();
  let lastError = "All Gemini image keys failed";

  for (const model of models) {
    const maxAttempts = Math.min(12, Math.max(1, keys.length));
    const skipped = new Set<number>();
    let attempts = 0;
    let modelDead = false;

    while (
      !modelDead &&
      attempts < maxAttempts &&
      skipped.size < keys.length
    ) {
      if (!hasAvailableGeminiKey("image")) break;

      const keyIndex = pickGeminiKeyIndex("image");
      if (skipped.has(keyIndex)) {
        releaseGeminiKey("image", keyIndex);
        attempts += 1;
        continue;
      }

      attempts += 1;
      console.info(
        `[image] gemini key#${keyIndex + 1}/${keys.length} model=${model} attempt=${attempts}`,
      );

      try {
        const result = await requestGeminiNativeImage(
          keys[keyIndex],
          model,
          query,
          opts,
        );
        noteGeminiKeySuccess("image", keyIndex);
        console.info(`[image] ok gemini key#${keyIndex + 1} model=${model}`);
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.warn(
          `[image] fail gemini key#${keyIndex + 1}:`,
          lastError.slice(0, 180),
        );
        skipped.add(keyIndex);

        if (isModelUnavailableError(lastError)) {
          modelDead = true;
          continue;
        }

        if (isDailyQuotaMessage(lastError)) {
          markGeminiKeyHot("image", keyIndex, {
            daily: true,
            message: lastError,
          });
        } else if (
          isCapacityMessage(lastError) ||
          isRateLimitMessage(lastError) ||
          /\b429\b/.test(lastError)
        ) {
          markGeminiKeyHot("image", keyIndex, { ms: 55_000 });
        } else {
          const status = parseGeminiStatus(lastError);
          const retryable =
            (status && isRetryableGeminiError(status, lastError)) ||
            isRetryableGeminiMessage(lastError);
          markGeminiKeyHot("image", keyIndex, {
            ms: retryable ? 55_000 : 20_000,
          });
        }
      } finally {
        releaseGeminiKey("image", keyIndex);
      }
    }
  }

  throw new Error(lastError);
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
  const provider = getImageProvider();
  const dims = { kind, aspect };

  if (provider === "pollinations") {
    return requestPollinationsImage(query, dims);
  }

  if (provider === "gemini") {
    return generateViaGemini(query, dims);
  }

  // auto: try Gemini briefly, then free Pollinations
  try {
    return await generateViaGemini(query, dims);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[image] gemini unavailable (${msg.slice(0, 120)}) — falling back to pollinations`,
    );
    return requestPollinationsImage(query, dims);
  }
}

/** @deprecated Prefer generateImagenImage — kept for route compatibility. */
export async function generateGeminiImage(
  query: string,
  aspectHint?: string,
  kind?: ImageKind,
): Promise<GeneratedImageBytes> {
  return generateImagenImage(query, { aspectHint, kind });
}

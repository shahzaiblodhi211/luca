import {
  getGeminiKeys,
  hasAvailableGeminiKey,
  isCapacityMessage,
  isRateLimitMessage,
  isRetryableGeminiError,
  isRetryableGeminiMessage,
  markGeminiKeyHot,
  parseGeminiStatus,
  pickGeminiKeyIndex,
  releaseGeminiKey,
} from "./gemini-keys";
import { downloadAsBase64, fetchPexelsPhoto } from "./pexels-image";

export type GeneratedImageBytes = {
  mimeType: string;
  base64: string;
  source: "gemini" | "pexels";
};

function getImageModels(): string[] {
  const primary =
    process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-2.5-flash-image";
  // One primary + one alternate — don't burn the same key on 3 identical models
  const alt =
    primary === "gemini-2.5-flash-image"
      ? "gemini-3.1-flash-image-preview"
      : "gemini-2.5-flash-image";
  return [...new Set([primary, alt])];
}

function buildPrompt(query: string, aspectHint?: string): string {
  const aspect = aspectHint || "16:9";
  return [
    "Generate a single high-quality photorealistic image.",
    "No text overlays, no watermarks, no logos, no borders.",
    `Aspect ratio: ${aspect}.`,
    "Match this description exactly and make it suitable for a modern website:",
    query.trim(),
  ].join("\n");
}

async function requestImage(
  apiKey: string,
  model: string,
  query: string,
  aspectHint?: string,
): Promise<GeneratedImageBytes> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: buildPrompt(query, aspectHint) }],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Gemini image ${response.status}: ${body.slice(0, 300)}`);
  }

  const json = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { mimeType?: string; data?: string };
          inline_data?: { mime_type?: string; data?: string };
        }>;
      };
    }>;
    error?: { message?: string; code?: number };
  };

  if (json.error) {
    throw new Error(
      `Gemini image ${json.error.code ?? 500}: ${json.error.message || "failed"}`,
    );
  }

  const parts = json.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inline = part.inlineData || part.inline_data;
    if (!inline?.data) continue;
    const mimeType =
      ("mimeType" in inline && inline.mimeType) ||
      ("mime_type" in inline && inline.mime_type) ||
      "image/png";
    return { mimeType: String(mimeType), base64: inline.data, source: "gemini" };
  }

  throw new Error("Gemini image response contained no image data");
}

async function generateWithGemini(
  query: string,
  aspectHint?: string,
): Promise<GeneratedImageBytes> {
  const keys = getGeminiKeys();
  const models = getImageModels();
  let lastError = "All Gemini image keys failed";
  const maxAttempts = Math.max(1, keys.length);
  let attempts = 0;

  while (attempts < maxAttempts) {
    if (!hasAvailableGeminiKey("image")) {
      throw new Error(
        "All Gemini image keys are rate-limited or out of daily quota.",
      );
    }

    const keyIndex = pickGeminiKeyIndex("image");
    const apiKey = keys[keyIndex];
    attempts += 1;

    try {
      for (const model of models) {
        try {
          const result = await requestImage(apiKey, model, query, aspectHint);
          console.info(`[gemini-image] ok key#${keyIndex + 1} model=${model}`);
          return result;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          console.warn(
            `[gemini-image] fail key#${keyIndex + 1} model=${model}:`,
            lastError.slice(0, 180),
          );

          if (/not found|not supported|invalid model/i.test(lastError)) {
            continue;
          }

          const status = parseGeminiStatus(lastError);
          if (
            (status && isRetryableGeminiError(status, lastError)) ||
            isRetryableGeminiMessage(lastError)
          ) {
            if (
              isRateLimitMessage(lastError) ||
              isCapacityMessage(lastError)
            ) {
              markGeminiKeyHot("image", keyIndex, { message: lastError });
            } else {
              markGeminiKeyHot("image", keyIndex, { ms: 1 });
            }
            break;
          }
          break;
        }
      }
    } finally {
      releaseGeminiKey("image", keyIndex);
    }
  }

  throw new Error(lastError);
}

async function generateWithPexels(query: string): Promise<GeneratedImageBytes> {
  const photo = await fetchPexelsPhoto(query);
  if (!photo) throw new Error("Pexels returned no photo");
  const bytes = await downloadAsBase64(photo.url);
  if (!bytes) throw new Error("Failed to download Pexels photo");
  console.info("[image] pexels fallback ok");
  return { ...bytes, source: "pexels" };
}

export async function generateGeminiImage(
  query: string,
  aspectHint?: string,
): Promise<GeneratedImageBytes> {
  // Agent path uses live Pexels URLs; this helper is Pexels-first (no Gemini burn).
  try {
    return await generateWithPexels(query);
  } catch (pexelsErr) {
    console.warn(
      "[gemini-image] Pexels failed, trying Gemini once:",
      pexelsErr instanceof Error ? pexelsErr.message.slice(0, 120) : pexelsErr,
    );
  }
  try {
    return await generateWithGemini(query, aspectHint);
  } catch (err) {
    console.warn(
      "[gemini-image] Gemini also failed:",
      err instanceof Error ? err.message.slice(0, 160) : err,
    );
    try {
      return await generateWithPexels(query);
    } catch (fallbackErr) {
      const a = err instanceof Error ? err.message : String(err);
      const b =
        fallbackErr instanceof Error
          ? fallbackErr.message
          : String(fallbackErr);
      throw new Error(`Image generation failed. Gemini: ${a} | Pexels: ${b}`);
    }
  }
}

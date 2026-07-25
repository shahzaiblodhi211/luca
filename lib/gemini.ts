import { AsyncLocalStorage } from "async_hooks";
import { getGeminiKeys } from "./gemini-keys";
import { getSystemPrompt } from "./system-prompt";
import { getAttachmentsByIds } from "./attachments";
import type { ChatAttachment } from "./types";

const RETRYABLE_STATUS = new Set([403, 429, 500, 502, 503, 504]);

/** SDK / @google/genai shape (camelCase). REST openStream maps to snake_case. */
type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

function inlineImagePart(
  mimeType: string,
  data: string | { toString?: (enc?: string) => string } | null | undefined,
): GeminiPart | null {
  let raw = "";
  if (typeof data === "string") raw = data;
  else if (data && typeof data.toString === "function") {
    // Mongo Binary / Buffer edge cases
    try {
      raw = data.toString("base64");
    } catch {
      raw = String(data);
    }
  }
  const b64 = raw.replace(/^data:[^;]+;base64,/, "").trim();
  if (!b64) return null;
  return {
    inlineData: {
      mimeType: mimeType || "image/jpeg",
      data: b64,
    },
  };
}

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
  attachments?: ChatAttachment[];
  /** Ephemeral images (e.g. site screenshots) not stored as chat attachments. */
  inlineImages?: Array<{
    mimeType: string;
    base64: string;
    label?: string;
  }>;
};

function getKeys(): string[] {
  return getGeminiKeys();
}

const geminiModelStore = new AsyncLocalStorage<string | undefined>();

export function getGeminiModel(): string {
  return (
    geminiModelStore.getStore() ??
    process.env.GEMINI_MODEL?.trim() ??
    "gemini-3.5-flash-lite"
  );
}

export function runWithGeminiModel<T>(
  model: string,
  fn: () => Promise<T>,
): Promise<T> {
  return geminiModelStore.run(model, fn);
}

function getModel(): string {
  return getGeminiModel();
}

declare global {
  // eslint-disable-next-line no-var
  var _geminiKeyIndex: number | undefined;
}

function nextKeyIndex(keysLen: number): number {
  const current = global._geminiKeyIndex ?? 0;
  global._geminiKeyIndex = (current + 1) % keysLen;
  return current % keysLen;
}

function markKeyFailed(failedIndex: number, keysLen: number) {
  global._geminiKeyIndex = (failedIndex + 1) % keysLen;
}

async function buildPartsForTurn(
  msg: ChatTurn,
  opts: { includeBinaryAttachments: boolean },
): Promise<GeminiPart[]> {
  const parts: GeminiPart[] = [];
  const attachments = msg.attachments ?? [];

  if (opts.includeBinaryAttachments && msg.inlineImages?.length) {
    for (const img of msg.inlineImages) {
      const media = inlineImagePart(img.mimeType || "image/jpeg", img.base64);
      if (media) parts.push(media);
      parts.push({
        text: [
          `[FULL-PAGE SCREENSHOT — ${img.label || "DESIGN SPEC"}]`,
          "THIS IMAGE IS THE ONLY DESIGN SPEC. Scroll/study every section.",
          "Recreate layout, colors, typography, buttons, spacing, and section order to match what you see.",
          "The brief only supplies media URLs (images/videos/icons) to plug into that design — ignore source-site CSS classes.",
          "Build the entire page to the footer, not just the hero.",
        ].join("\n"),
      });
    }
  }

  if (attachments.length) {
    const stored = opts.includeBinaryAttachments
      ? await getAttachmentsByIds(attachments.map((a) => a.id))
      : [];
    const byId = new Map(stored.map((s) => [s._id, s]));

    for (const meta of attachments) {
      const file = byId.get(meta.id);

      if (meta.kind === "image") {
        const safeName = meta.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        if (opts.includeBinaryAttachments && file?.base64) {
          const media = inlineImagePart(
            file.mimeType || "image/jpeg",
            file.base64,
          );
          if (media) parts.push(media);
          else {
            console.warn(
              `[gemini] skip empty image bytes for attachment ${meta.id}`,
            );
          }
        }
        parts.push({
          text: [
            `[User uploaded image: ${meta.name}]`,
            `URL: ${meta.url}`,
            opts.includeBinaryAttachments && file?.base64
              ? "INSPECT visually like DevTools: identify layout regions, spacing, type scale, colors, components. Recreate a pixel-faithful clone when asked."
              : opts.includeBinaryAttachments
                ? "(image binary missing from storage — use the URL / prior context)"
                : "(image was attached earlier — use conversation context; binary omitted for speed)",
            "To embed in a Code Project:",
            "```png isHidden file=\"public/images/" +
              safeName +
              "\" url=\"" +
              meta.url +
              "\"",
            "```",
            `Then use src="/images/${safeName}" in JSX.`,
          ].join("\n"),
        });
      } else if (file?.kind === "text" && file.textContent) {
        // Keep text file content only for recent turns too (can be large)
        if (opts.includeBinaryAttachments) {
          parts.push({
            text: `[User uploaded file: ${file.name}]\n\`\`\`\n${file.textContent.slice(0, 40_000)}\n\`\`\``,
          });
        } else {
          parts.push({
            text: `[User uploaded file earlier: ${meta.name} at ${meta.url}]`,
          });
        }
      } else {
        parts.push({
          text: `[User uploaded file: ${meta.name} (${meta.mimeType}, ${meta.size} bytes) at ${meta.url}]`,
        });
        if (
          opts.includeBinaryAttachments &&
          file?.base64 &&
          (file.mimeType === "application/pdf" ||
            file.name.toLowerCase().endsWith(".pdf"))
        ) {
          const media = inlineImagePart("application/pdf", file.base64);
          if (media) parts.push(media);
        }
      }
    }
  }

  const text = msg.content?.trim();
  if (text) {
    parts.push({ text });
  } else if (!parts.length) {
    parts.push({ text: "(empty message)" });
  }

  return parts;
}

export async function toGeminiContents(messages: ChatTurn[]): Promise<GeminiContent[]> {
  const contents: GeminiContent[] = [];
  // Only the latest user turn gets full image bytes — huge speed win
  let lastUserWithAttachments = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (
      m.role === "user" &&
      ((m.attachments?.length || 0) > 0 || (m.inlineImages?.length || 0) > 0)
    ) {
      lastUserWithAttachments = i;
      break;
    }
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const role = msg.role === "assistant" ? "model" : "user";
    const parts = await buildPartsForTurn(msg, {
      includeBinaryAttachments: i === lastUserWithAttachments || i === messages.length - 1,
    });
    const hasMedia = parts.some((p) => "inlineData" in p);
    const last = contents[contents.length - 1];

    if (last && last.role === role && !hasMedia && role === "model") {
      const lastText = last.parts.find((p) => "text" in p && p.text);
      const newText = parts.find((p) => "text" in p && p.text);
      if (lastText && newText && "text" in lastText && "text" in newText) {
        lastText.text = `${lastText.text}\n\n${newText.text}`;
        continue;
      }
    }

    contents.push({ role, parts });
  }

  return contents;
}

function isRetryableError(status: number, body: string): boolean {
  if (RETRYABLE_STATUS.has(status)) return true;
  const lower = body.toLowerCase();
  return (
    lower.includes("resource_exhausted") ||
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("unavailable") ||
    lower.includes("overloaded")
  );
}

/** REST generateContent still wants snake_case part fields. */
function toRestContents(contents: GeminiContent[]) {
  return contents.map((c) => ({
    role: c.role,
    parts: c.parts.map((p) => {
      if ("inlineData" in p && p.inlineData) {
        return {
          inline_data: {
            mime_type: p.inlineData.mimeType,
            data: p.inlineData.data,
          },
        };
      }
      return p;
    }),
  }));
}

async function openStream(apiKey: string, messages: ChatTurn[]): Promise<Response> {
  const model = getModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
  const contents = toRestContents(await toGeminiContents(messages));

  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: getSystemPrompt() }],
      },
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 16384,
      },
    }),
  });
}

export async function streamGeminiChat(
  messages: ChatTurn[],
): Promise<ReadableStream<Uint8Array>> {
  const keys = getKeys();
  const start = nextKeyIndex(keys.length);
  let lastError = "All Gemini API keys failed";

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const keyIndex = (start + attempt) % keys.length;
    const apiKey = keys[keyIndex];

    try {
      const response = await openStream(apiKey, messages);

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        lastError = `Gemini ${response.status}: ${body.slice(0, 280)}`;
        console.warn(`[gemini] key#${keyIndex + 1} failed`, response.status);

        if (isRetryableError(response.status, body) && attempt < keys.length - 1) {
          markKeyFailed(keyIndex, keys.length);
          continue;
        }
        throw new Error(lastError);
      }

      if (!response.body) {
        lastError = "Gemini returned empty body";
        if (attempt < keys.length - 1) {
          markKeyFailed(keyIndex, keys.length);
          continue;
        }
        throw new Error(lastError);
      }

      console.info(`[gemini] using key#${keyIndex + 1}`);
      return pipeGeminiSse(response.body);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      const statusMatch = lastError.match(/\b(403|429|500|502|503|504)\b/);
      const retryableText =
        /resource_exhausted|quota|rate limit|unavailable|overloaded|502|bad gateway/i.test(
          lastError,
        );
      if (
        attempt < keys.length - 1 &&
        (statusMatch ||
          retryableText ||
          lastError.includes("fetch failed") ||
          lastError.includes("ECONNRESET") ||
          lastError.includes("socket"))
      ) {
        markKeyFailed(keyIndex, keys.length);
        continue;
      }
      if (attempt === keys.length - 1) throw new Error(lastError);
      markKeyFailed(keyIndex, keys.length);
    }
  }

  throw new Error(lastError);
}

function pipeGeminiSse(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream({
    async start(controller) {
      const reader = body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            let data = trimmed;
            if (trimmed.startsWith("data:")) {
              data = trimmed.slice(5).trim();
            }
            if (!data || data === "[DONE]") continue;

            try {
              const json = JSON.parse(data) as {
                candidates?: Array<{
                  content?: { parts?: Array<{ text?: string }> };
                }>;
                error?: { message?: string; code?: number; status?: string };
              };
              if (json.error) {
                const code = json.error.code ?? 500;
                throw new Error(
                  `Gemini ${code}: ${json.error.message || json.error.status || "stream error"}`,
                );
              }
              const text = json.candidates?.[0]?.content?.parts
                ?.map((p) => p.text ?? "")
                .join("");
              if (text) {
                controller.enqueue(encoder.encode(text));
              }
            } catch (parseErr) {
              if (
                parseErr instanceof Error &&
                (parseErr.message.startsWith("Gemini") ||
                  /\b(403|429|500|502|503|504)\b/.test(parseErr.message))
              ) {
                throw parseErr;
              }
            }
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      } finally {
        reader.releaseLock();
      }
    },
  });
}

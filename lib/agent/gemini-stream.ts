import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  ThinkingLevel as GenaiThinkingLevel,
  type Content,
  type Part as GenaiPart,
} from "@google/genai";
import { getGeminiModel } from "@/lib/gemini";
import { getAgentSystemPrompt } from "@/lib/system-prompt";
import {
  type ThinkingLevel,
} from "@/lib/thinking-level";
import { resolveGeminiThinkingLevel } from "@/lib/agent/resolve-thinking-level";
import { AGENT_TOOL_DECLARATIONS } from "./tools";

export type GeminiPart = {
  text?: string;
  thought?: boolean;
  /** Required for Gemini 3.x multi-turn / tool loops — must be echoed back. */
  thoughtSignature?: string;
  /** Vision / PDF bytes — must be camelCase for @google/genai. */
  inlineData?: {
    mimeType: string;
    data: string;
  };
  functionCall?: {
    name?: string;
    args?: Record<string, unknown>;
    /** Tool-call id when present — echoed on functionResponse. */
    id?: string;
  };
  functionResponse?: {
    name: string;
    response: Record<string, unknown>;
    id?: string;
  };
};

/** Drop empty / invalid parts that trigger Gemini 400 oneof 'data' errors. */
export function sanitizeGeminiContents(
  contents: GeminiContent[],
): GeminiContent[] {
  return contents
    .map((c) => ({
      ...c,
      parts: c.parts.filter((p) => {
        if (p.inlineData) {
          return Boolean(p.inlineData.data?.trim() && p.inlineData.mimeType);
        }
        if (p.functionCall?.name) return true;
        if (p.functionResponse?.name) return true;
        if (typeof p.text === "string" && p.text.length > 0) return true;
        // Allow thought-signature-only echoes used by Gemini 3 tool loops
        if (p.thoughtSignature) return true;
        return false;
      }),
    }))
    .filter((c) => c.parts.length > 0);
}

export type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

export type GeminiStreamHandlers = {
  onTextDelta?: (text: string) => void;
  onThoughtDelta?: (text: string) => void;
  onFunctionCallStart?: (
    name: string,
    args: Record<string, unknown>,
  ) => void;
};

export type GeminiStreamResult = {
  parts: GeminiPart[];
  text: string;
  thought: string;
  functionCalls: Array<{
    name: string;
    args: Record<string, unknown>;
    id?: string;
  }>;
};

function toSdkThinkingLevel(
  model: string,
  value?: ThinkingLevel | string | null,
): GenaiThinkingLevel {
  switch (resolveGeminiThinkingLevel(model, value)) {
    case "MINIMAL":
      return GenaiThinkingLevel.MINIMAL;
    case "MEDIUM":
      return GenaiThinkingLevel.MEDIUM;
    case "HIGH":
      return GenaiThinkingLevel.HIGH;
    case "LOW":
    default:
      return GenaiThinkingLevel.LOW;
  }
}

function takeIncremental(
  previous: string,
  incoming: string,
): { next: string; delta: string } {
  if (!incoming) return { next: previous, delta: "" };
  if (!previous) return { next: incoming, delta: incoming };
  if (incoming.startsWith(previous)) {
    return { next: incoming, delta: incoming.slice(previous.length) };
  }
  return { next: previous + incoming, delta: incoming };
}

function mergePart(into: GeminiPart[], part: GeminiPart) {
  const last = into[into.length - 1];

  if (
    last &&
    typeof last.text === "string" &&
    typeof part.text === "string" &&
    Boolean(last.thought) === Boolean(part.thought) &&
    !part.functionCall &&
    !last.functionCall &&
    !part.functionResponse &&
    !last.functionResponse
  ) {
    if (part.text.startsWith(last.text)) last.text = part.text;
    else last.text = (last.text || "") + (part.text || "");
    if (part.thoughtSignature && !last.thoughtSignature) {
      last.thoughtSignature = part.thoughtSignature;
    }
    return;
  }

  if (
    last?.functionCall?.name &&
    part.functionCall?.name &&
    last.functionCall.name === part.functionCall.name
  ) {
    last.functionCall.args = {
      ...(last.functionCall.args || {}),
      ...(part.functionCall.args || {}),
    };
    if (part.thoughtSignature) {
      last.thoughtSignature = part.thoughtSignature;
    }
    return;
  }

  into.push({ ...part });
}

function fromSdkPart(part: GenaiPart): GeminiPart {
  const out: GeminiPart = {};
  if (typeof part.text === "string") out.text = part.text;
  if (part.thought === true || String(part.thought) === "true") out.thought = true;
  if (part.thoughtSignature) out.thoughtSignature = part.thoughtSignature;
  if (part.functionCall?.name) {
    out.functionCall = {
      name: part.functionCall.name,
      args: (part.functionCall.args || {}) as Record<string, unknown>,
    };
  }
  if (part.functionResponse?.name) {
    out.functionResponse = {
      name: part.functionResponse.name,
      response: (part.functionResponse.response || {}) as Record<
        string,
        unknown
      >,
    };
  }
  return out;
}

/**
 * Bail to the next API key if Gemini never yields a first chunk.
 * Keep this generous — 8s caused fake "503 capacity" cascades under load
 * (model still thinking / queueing) and burned the whole pool for nothing.
 */
const FIRST_CHUNK_TIMEOUT_MS = 45_000;

function raceWithTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

export type GeminiStreamOptions = {
  /** When false, native text + thought stream (Q&A). When true, agent tools (builds). */
  useAgentTools?: boolean;
};

/**
 * Official Google GenAI SDK streaming: `models.generateContentStream`.
 * Yields thought/text/tool-start as chunks arrive from the SDK.
 */
export async function streamGeminiGenerateContent(
  apiKey: string,
  contents: GeminiContent[],
  handlers: GeminiStreamHandlers = {},
  thinkingLevel?: ThinkingLevel | string | null,
  options: GeminiStreamOptions = {},
): Promise<GeminiStreamResult> {
  const ai = new GoogleGenAI({ apiKey });
  const model = getGeminiModel();
  const useAgentTools = options.useAgentTools !== false;
  const apiThinkLevel = toSdkThinkingLevel(model, thinkingLevel);

  console.info(
    `[gemini] model=${model} includeThoughts=true thinkingLevel=${apiThinkLevel} tools=${useAgentTools}`,
  );

  const streamConfig = {
    model,
    contents: sanitizeGeminiContents(contents) as Content[],
    config: {
      systemInstruction: getAgentSystemPrompt(),
      temperature: 0.6,
      maxOutputTokens: 16384,
      ...(useAgentTools
        ? {
            tools: [
              {
                functionDeclarations: AGENT_TOOL_DECLARATIONS as never,
              },
            ],
            toolConfig: {
              functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO },
            },
          }
        : {}),
      thinkingConfig: {
        includeThoughts: true,
        thinkingLevel: toSdkThinkingLevel(model, thinkingLevel),
      },
    },
  };

  const stream = await raceWithTimeout(
    ai.models.generateContentStream(streamConfig),
    FIRST_CHUNK_TIMEOUT_MS,
    "503 Gemini stream connect timeout — high demand / rotating key",
  );

  const parts: GeminiPart[] = [];
  let text = "";
  let thought = "";
  const announcedTools = new Set<string>();

  const iterator = stream[Symbol.asyncIterator]();
  let awaitingFirst = true;

  while (true) {
    const nextPromise = iterator.next();
    const result = awaitingFirst
      ? await raceWithTimeout(
          nextPromise,
          FIRST_CHUNK_TIMEOUT_MS,
          "503 Gemini first-chunk timeout — high demand / rotating key",
        )
      : await nextPromise;
    awaitingFirst = false;

    if (result.done) break;
    const chunk = result.value;

    const chunkParts = chunk.candidates?.[0]?.content?.parts ?? [];
    for (const raw of chunkParts) {
      const part = fromSdkPart(raw);

      if (typeof part.text === "string" && part.text.length) {
        if (part.thought) {
          const { next, delta } = takeIncremental(thought, part.text);
          thought = next;
          if (delta) handlers.onThoughtDelta?.(delta);
        } else {
          const { next, delta } = takeIncremental(text, part.text);
          text = next;
          if (delta) handlers.onTextDelta?.(delta);
        }
      }

      if (part.functionCall?.name) {
        const name = part.functionCall.name;
        const args = part.functionCall.args || {};
        const key = `${name}:${String(args.path || args.id || args.name || "")}`;
        if (!announcedTools.has(key)) {
          announcedTools.add(key);
          handlers.onFunctionCallStart?.(name, args);
        }
      }

      mergePart(parts, part);
    }

    for (const fc of chunk.functionCalls ?? []) {
      if (!fc.name) continue;
      const args = (fc.args || {}) as Record<string, unknown>;
      const key = `${fc.name}:${String(args.path || args.id || args.name || "")}`;
      if (!announcedTools.has(key)) {
        announcedTools.add(key);
        handlers.onFunctionCallStart?.(fc.name, args);
      }
    }
  }

  const functionCalls: GeminiStreamResult["functionCalls"] = [];
  for (const p of parts) {
    if (!p.functionCall?.name) continue;
    functionCalls.push({
      name: p.functionCall.name,
      args: (p.functionCall.args || {}) as Record<string, unknown>,
      id: p.functionCall.id,
    });
  }

  return { parts, text, thought, functionCalls };
}

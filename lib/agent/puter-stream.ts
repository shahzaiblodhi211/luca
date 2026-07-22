import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { createPuterClient, getPuterModel } from "@/lib/puter";
import { getAgentSystemPrompt } from "@/lib/system-prompt";
import { chunkForStream } from "./pace-text";
import { AGENT_TOOL_DECLARATIONS } from "./tools";
import type {
  GeminiContent,
  GeminiPart,
  GeminiStreamHandlers,
  GeminiStreamResult,
} from "./gemini-stream";

function toOpenAITools(): ChatCompletionTool[] {
  return AGENT_TOOL_DECLARATIONS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      // Plain JSON schema — avoid readonly/as-const quirks over the wire
      parameters: JSON.parse(JSON.stringify(t.parameters)) as Record<
        string,
        unknown
      >,
    },
  }));
}

/**
 * Convert Luca's Gemini-shaped contents into OpenAI chat messages for Puter.
 * Preserves tool_call ids via functionCall.id / functionResponse.id when present.
 */
export function geminiContentsToOpenAIMessages(
  contents: GeminiContent[],
): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: getAgentSystemPrompt() },
  ];

  let toolCallSeq = 0;

  for (const turn of contents) {
    if (turn.role === "user") {
      const texts: string[] = [];
      for (const part of turn.parts) {
        if (part.functionResponse?.name) {
          const id =
            part.functionResponse.id ||
            `call_${part.functionResponse.name}_${toolCallSeq++}`;
          messages.push({
            role: "tool",
            tool_call_id: id,
            content: JSON.stringify(part.functionResponse.response ?? {}),
          });
        } else if (typeof part.text === "string" && part.text) {
          texts.push(part.text);
        }
      }
      if (texts.length) {
        messages.push({ role: "user", content: texts.join("\n\n") });
      }
      continue;
    }

    const textBits = turn.parts
      .filter((p) => typeof p.text === "string" && !p.thought)
      .map((p) => p.text as string);
    const toolParts = turn.parts.filter((p) => p.functionCall?.name);

    if (toolParts.length) {
      messages.push({
        role: "assistant",
        content: textBits.join("\n\n") || null,
        tool_calls: toolParts.map((p) => {
          const name = p.functionCall!.name!;
          const id = p.functionCall!.id || `call_${name}_${toolCallSeq++}`;
          return {
            id,
            type: "function" as const,
            function: {
              name,
              arguments: JSON.stringify(p.functionCall!.args || {}),
            },
          };
        }),
      });
    } else if (textBits.length) {
      messages.push({ role: "assistant", content: textBits.join("\n\n") });
    }
  }

  return messages;
}

/**
 * Puter OpenAI-compatible completion with tools.
 * Uses non-streaming requests — Puter's streaming path often omits tool_calls
 * (their own docs use non-stream for function calling). Text is paced to the UI.
 */
export async function streamPuterGenerateContent(
  authToken: string,
  contents: GeminiContent[],
  handlers: GeminiStreamHandlers = {},
): Promise<GeminiStreamResult> {
  const client = createPuterClient(authToken);
  const model = getPuterModel();
  const messages = geminiContentsToOpenAIMessages(contents);
  const tools = toOpenAITools();

  const response = await client.chat.completions.create({
    model,
    messages,
    tools,
    tool_choice: "auto",
    stream: false,
    temperature: 0.6,
    max_tokens: 16384,
  });

  const message = response.choices?.[0]?.message;
  if (!message) {
    throw new Error("Puter returned an empty chat completion");
  }

  const parts: GeminiPart[] = [];
  let text = "";
  const thought = "";
  const functionCalls: GeminiStreamResult["functionCalls"] = [];

  if (typeof message.content === "string" && message.content) {
    text = message.content;
    parts.push({ text });
    for (const piece of chunkForStream(text, 48)) {
      handlers.onTextDelta?.(piece);
    }
  }

  const toolCalls = message.tool_calls ?? [];
  for (const tc of toolCalls) {
    if (!("function" in tc) || !tc.function?.name) continue;
    let args: Record<string, unknown> = {};
    try {
      args = tc.function.arguments
        ? (JSON.parse(tc.function.arguments) as Record<string, unknown>)
        : {};
    } catch {
      args = { _raw: tc.function.arguments };
    }
    const id = tc.id || `call_${tc.function.name}_${functionCalls.length}`;
    handlers.onFunctionCallStart?.(tc.function.name, args);
    parts.push({
      functionCall: { name: tc.function.name, args, id },
    });
    functionCalls.push({ name: tc.function.name, args, id });
  }

  console.info(
    `[puter] model=${model} text=${text.length}c tools=${functionCalls.length}${
      functionCalls.length
        ? ` (${functionCalls.map((c) => c.name).join(", ")})`
        : ""
    }`,
  );

  return { parts, text, thought, functionCalls };
}

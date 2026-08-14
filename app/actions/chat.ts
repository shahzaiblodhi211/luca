"use server";

import { createStreamableValue } from "@ai-sdk/rsc";
import type { AgentStreamEvent } from "@/lib/agent/events";
import {
  runChatGeneration,
  type RunChatInput,
} from "@/lib/agent/run-chat";

export async function cancelChatGenerationAction(chatId: string) {
  const id = chatId?.trim();
  if (!id) return;
  const { requestChatGenerationCancel } = await import(
    "@/lib/agent/generation-cancel"
  );
  requestChatGenerationCancel(id);
}

/**
 * Keep-alive while waiting for Gemini (key hunt, 503 rotate, thinking).
 * Must stay under AI SDK's "slow to update" threshold (~3s).
 */
const HEARTBEAT_MS = 1_500;

/**
 * Only stop heartbeats once the UI is getting frequent real progress.
 * Do NOT stop on `thinking` — that event fires once then goes silent for
 * the whole model-think + tool-buffer window (the bug that froze the UI).
 */
const STOPS_HEARTBEAT = new Set<AgentStreamEvent["type"]>([
  "phase",
  "file",
  "command",
  "text",
  "text_delta",
  "thinking_delta",
  "summary",
  "preview",
  "image",
  "package",
  "actions",
  "env_request",
  "done",
  "error",
]);

/**
 * Chat over Next.js RSC Flight (`content-type: text/x-component`).
 * Client reads with `readStreamableValue` from `@ai-sdk/rsc`.
 */
export async function streamChatAction(input: RunChatInput) {
  const streamable = createStreamableValue<AgentStreamEvent | null>(null);
  let lastPush = 0;
  let closed = false;
  let heartbeats = true;

  const push = (event: AgentStreamEvent) => {
    if (closed) return;
    if (STOPS_HEARTBEAT.has(event.type)) heartbeats = false;
    lastPush = Date.now();
    try {
      streamable.update(event);
    } catch {
      closed = true;
    }
  };

  // Immediate keep-alive — do NOT use `thinking` here (that used to kill heartbeats)
  push({ type: "ping", t: Date.now() });

  const heartbeat = setInterval(() => {
    if (closed || !heartbeats) return;
    if (Date.now() - lastPush < HEARTBEAT_MS - 250) return;
    push({ type: "ping", t: Date.now() });
  }, HEARTBEAT_MS);

  void (async () => {
    try {
      await runChatGeneration(input, (event) => {
        push(event);
      });
      closed = true;
      clearInterval(heartbeat);
      try {
        streamable.done();
      } catch {
        /* already closed */
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Chat failed";
      push({ type: "error", message });
      closed = true;
      clearInterval(heartbeat);
      try {
        streamable.done();
      } catch {
        try {
          streamable.error(err);
        } catch {
          /* ignore */
        }
      }
    }
  })();

  return { events: streamable.value };
}

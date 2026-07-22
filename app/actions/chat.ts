"use server";

import { createStreamableValue } from "@ai-sdk/rsc";
import type { AgentStreamEvent } from "@/lib/agent/events";
import {
  runChatGeneration,
  type RunChatInput,
} from "@/lib/agent/run-chat";

/** Keep-alive only while waiting for the first real Gemini tokens. */
const HEARTBEAT_MS = 5_000;

const STOPS_HEARTBEAT = new Set<AgentStreamEvent["type"]>([
  "thinking",
  "thinking_done",
  "phase",
  "file",
  "command",
  "text",
  "text_delta",
  "summary",
  "status",
  "preview",
  "image",
  "package",
  "actions",
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

  // First byte immediately — UI shimmer while Mongo / key hunt / Gemini connect
  push({ type: "thinking", text: "" });

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

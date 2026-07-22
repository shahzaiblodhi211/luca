import type { AgentStreamEvent } from "./events";

/** Split into small pieces so the wire looks like real token streaming. */
export function chunkForStream(text: string, maxChars = 48): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + maxChars, text.length);
    if (end < text.length) {
      const slice = text.slice(i, end);
      const space = slice.lastIndexOf(" ");
      const br = slice.lastIndexOf("\n");
      const breakAt = Math.max(space, br);
      if (breakAt > maxChars * 0.35) end = i + breakAt + 1;
    }
    chunks.push(text.slice(i, end));
    i = end;
  }
  return chunks;
}

/**
 * Emit text as many `text_delta` events (v0-style live stream), no sleep.
 */
export async function emitPacedText(
  emit: (event: AgentStreamEvent) => void,
  text: string,
) {
  emit({ type: "text", text: "" });
  for (const piece of chunkForStream(text)) {
    emit({ type: "text_delta", text: piece });
  }
}

export async function emitPacedThinking(
  emit: (event: AgentStreamEvent) => void,
  text: string,
  durationSec: number,
) {
  emit({ type: "thinking", text: "" });
  for (const piece of chunkForStream(text, 64)) {
    emit({ type: "thinking_delta", text: piece });
  }
  emit({ type: "thinking_done", durationSec });
}

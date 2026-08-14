/** Meta-planning voice — belongs in Reasoning / `think`, never in the chat bubble. */
const LEAK_OPENERS =
  /^(?:The user (?:wants|is asking|needs|asked|would like|has asked)|I'll (?:provide|give|start|begin|outline|explain|describe)|I will (?:provide|give|start|begin|outline|explain|describe)|Let me (?:provide|give|start|begin|outline|explain|describe)|My plan is to)/i;

/** Paragraph is internal planning, not a user-facing answer. */
export function isReasoningLeakParagraph(paragraph: string): boolean {
  const p = paragraph.replace(/\s+/g, " ").trim();
  if (!p || p.length > 600) return false;
  if (LEAK_OPENERS.test(p)) return true;
  if (
    /^The user/i.test(p) &&
    /\bI will\b/i.test(p) &&
    !/^#{1,3}\s/m.test(p)
  ) {
    return true;
  }
  return false;
}

/**
 * Split leaked reasoning preamble from the user-facing answer.
 * e.g. "The user wants… I will provide…\n\n## Capabilities" → leak + "## Capabilities…"
 */
export function splitReasoningLeak(text: string): {
  leaked: string;
  visible: string;
} {
  const trimmed = text.trim();
  if (!trimmed) return { leaked: "", visible: "" };

  const paraBreak = trimmed.search(/\n\n+/);
  if (paraBreak > 0) {
    const first = trimmed.slice(0, paraBreak).trim();
    const rest = trimmed.slice(paraBreak).trim();
    if (isReasoningLeakParagraph(first)) {
      return { leaked: first, visible: rest };
    }
  }

  const heading = trimmed.match(/^([\s\S]{1,520}?)(\n#{1,3}\s[\s\S]+)$/);
  if (heading) {
    const lead = heading[1]!.trim();
    const body = heading[2]!.trim();
    if (isReasoningLeakParagraph(lead)) {
      return { leaked: lead, visible: body };
    }
  }

  if (isReasoningLeakParagraph(trimmed)) {
    return { leaked: trimmed, visible: "" };
  }

  return { leaked: "", visible: trimmed };
}

/** User-facing reply only — strips reasoning preamble when present. */
export function sanitizeVisibleReply(text: string): string {
  return splitReasoningLeak(text).visible;
}

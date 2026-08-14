/** Reasoning panel: plain paragraphs only — strip headings / markdown titles. */
export function formatThinkingText(text: string): string {
  let t = text.trim();
  if (!t) return t;

  // ATX headings (# Title) → plain line
  t = t.replace(/^#{1,6}\s+(.+)$/gm, "$1");

  // Bold-only lines (**Title**) → plain line
  t = t.replace(/^\*\*(.+?)\*\*\s*$/gm, "$1");

  // Bold opener on a line (**Title** rest) → plain
  t = t.replace(/^\*\*(.+?)\*\*\s*/gm, "$1");

  // Bullet lists in thinking → inline sentences
  t = t.replace(/^[\s]*[-*•]\s+/gm, "");

  // Numbered list markers
  t = t.replace(/^[\s]*\d+[.)]\s+/gm, "");

  t = t.replace(/\n{3,}/g, "\n\n").trim();
  return t;
}

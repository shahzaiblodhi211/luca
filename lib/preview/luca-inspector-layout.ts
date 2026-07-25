export function ensureInspectorInLayout(layout: string): string {
  if (layout.includes("luca-inspector.js")) return layout;
  const tag = `\n        <script src="/luca-inspector.js" defer />\n`;
  if (layout.includes("</body>")) {
    return layout.replace("</body>", `${tag}      </body>`);
  }
  if (layout.includes("{children}")) {
    return layout.replace(
      "{children}",
      `{children}${tag.replace(/\n/g, "")}`,
    );
  }
  return `${layout}\n${tag}`;
}

/** Strip old inspector tags and inject inline script (works with Next basePath). */
export function ensureInspectorInLayout(
  layout: string,
  inspectorJs: string,
): string {
  let out = layout
    .replace(/import Script from ["']next\/script["'];\s*\n?/g, "")
    .replace(/<Script[\s\S]*?luca-inspector[\s\S]*?\/>/gi, "")
    .replace(/<script[\s\S]*?luca-inspector[\s\S]*?<\/script>/gi, "")
    .replace(/<script[\s\S]*?luca-inspector[\s\S]*?\/>/gi, "");

  if (out.includes("luca-inspector-inline")) return out;

  const tag = `
        <script
          id="luca-inspector-inline"
          dangerouslySetInnerHTML={{
            __html: ${JSON.stringify(inspectorJs)},
          }}
        />`;

  if (out.includes("</body>")) {
    return out.replace("</body>", `${tag}\n      </body>`);
  }
  if (out.includes("{children}")) {
    return out.replace("{children}", `{children}${tag}`);
  }
  return `${out}\n${tag}\n`;
}

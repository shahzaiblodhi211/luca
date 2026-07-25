import fs from "node:fs/promises";
import path from "node:path";
import { workspaceDirFor } from "./paths";

const MARKER = 'id="luca-preview-base"';

function injectBaseScript(layout: string, basePath: string): string {
  const inline = `window.__LUCA_PREVIEW_BASE__=${JSON.stringify(basePath)};`;
  const tag = `
        <script
          id="luca-preview-base"
          dangerouslySetInnerHTML={{
            __html: ${JSON.stringify(inline)},
          }}
        />`;

  if (layout.includes(MARKER)) {
    return layout.replace(
      /window\.__LUCA_PREVIEW_BASE__\s*=\s*(?:JSON\.stringify\([^)]+\)|"[^"]*"|'[^']*')/,
      `window.__LUCA_PREVIEW_BASE__=${JSON.stringify(basePath)}`,
    );
  }

  if (layout.includes("</body>")) {
    return layout.replace("</body>", `${tag}\n      </body>`);
  }
  if (layout.includes("{children}")) {
    return layout.replace("{children}", `{children}${tag}`);
  }
  return `${layout}\n${tag}\n`;
}

/** Inject runtime basePath for in-preview link fixing (plain <a href="/...">). */
export async function patchWorkspacePreviewBasePath(
  chatId: string,
  basePath: string | null,
): Promise<void> {
  if (!basePath?.trim()) return;
  const dir = workspaceDirFor(chatId);
  for (const rel of ["app/layout.tsx", "src/app/layout.tsx"]) {
    const fp = path.join(dir, rel);
    try {
      const layout = await fs.readFile(fp, "utf8");
      const next = injectBaseScript(layout, basePath.replace(/\/+$/, ""));
      if (next !== layout) await fs.writeFile(fp, next, "utf8");
    } catch {
      /* no layout at this path */
    }
  }
}

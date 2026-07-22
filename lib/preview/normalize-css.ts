/**
 * Preview runtime uses Tailwind CSS v4 + @tailwindcss/postcss.
 * Agents often emit Tailwind v3 `@tailwind base/components/utilities`,
 * which produces an unstyled page. Normalize before writing to disk.
 */
export function normalizePreviewCss(code: string): string {
  let css = code.replace(/^\uFEFF/, "");

  // Drop v3 directives (with optional spaces / newlines)
  css = css
    .replace(/@tailwind\s+base\s*;?/gi, "")
    .replace(/@tailwind\s+components\s*;?/gi, "")
    .replace(/@tailwind\s+utilities\s*;?/gi, "")
    .replace(/@tailwind\s+screens\s*;?/gi, "");

  // Drop broken v3-style @config pointing at missing/wrong configs
  css = css.replace(/@config\s+["'][^"']+["']\s*;?/gi, "");

  const hasImport =
    /@import\s+["']tailwindcss["']\s*;/.test(css) ||
    /@import\s+["']tailwindcss\//.test(css);

  if (!hasImport) {
    css = `@import "tailwindcss";\n\n${css.trimStart()}`;
  } else {
    // Ensure import is first meaningful line (after optional charset)
    const importMatch = css.match(/@import\s+["']tailwindcss["']\s*;/);
    if (importMatch && importMatch.index !== undefined && importMatch.index > 0) {
      const before = css.slice(0, importMatch.index);
      const after = css.slice(importMatch.index + importMatch[0].length);
      // Keep @charset if present at start
      const charset = before.match(/^(\s*@charset\s+[^;]+;\s*)/i)?.[1] ?? "";
      const restBefore = before.replace(/^(\s*@charset\s+[^;]+;\s*)/i, "");
      css = `${charset}@import "tailwindcss";\n\n${(restBefore + after).trimStart()}`;
    }
  }

  // Collapse excessive blank lines at top
  css = css.replace(/(@import\s+["']tailwindcss["']\s*;)\s+/i, "$1\n\n");

  return css;
}

/** Host-owned preview tooling paths the agent must not overwrite. */
export function isHostOwnedPreviewPath(relPath: string): boolean {
  const p = relPath.replace(/^\/+/, "").replace(/\\/g, "/");
  return (
    p === "package.json" ||
    p === "package-lock.json" ||
    p === "postcss.config.mjs" ||
    p === "postcss.config.js" ||
    p === "postcss.config.cjs" ||
    p === "next.config.ts" ||
    p === "next.config.js" ||
    p === "next.config.mjs" ||
    /^tailwind\.config\.(ts|js|mjs|cjs)$/i.test(p) ||
    p === "components/theme-provider.tsx"
  );
}

/** Keep agent next.config while enforcing preview basePath + sensible image defaults. */

const PREVIEW_BASE_HELPER = `const lucaPreviewBasePath =
  process.env.LUCA_PREVIEW_BASE_PATH?.trim() || undefined;
`;

export function ensurePreviewNextConfig(code: string): string {
  let next = code.replace(/^\uFEFF/, "").trim();
  if (!next) return next;

  if (!next.includes("lucaPreviewBasePath")) {
    next = `${PREVIEW_BASE_HELPER}\n${next}`;
  }

  if (!/\bbasePath\b/.test(next)) {
    if (/(const\s+nextConfig\s*(?::\s*NextConfig\s*)?=\s*\{)/.test(next)) {
      next = next.replace(
        /(const\s+nextConfig\s*(?::\s*NextConfig\s*)?=\s*\{)/,
        `$1\n  ...(lucaPreviewBasePath ? { basePath: lucaPreviewBasePath } : {}),`,
      );
    } else if (/export\s+default\s*\{/.test(next)) {
      next = next.replace(
        /export\s+default\s*\{/,
        `export default {\n  ...(lucaPreviewBasePath ? { basePath: lucaPreviewBasePath } : {}),`,
      );
    }
  }

  if (!/\bunoptimized\b/.test(next) && /images\s*:\s*\{/.test(next)) {
    next = next.replace(/(images\s*:\s*\{)/, `$1\n    unoptimized: true,`);
  } else if (!/\bimages\b/.test(next)) {
    next = next.replace(
      /(const\s+nextConfig\s*(?::\s*NextConfig\s*)?=\s*\{)/,
      `$1\n  images: { unoptimized: true },`,
    );
  }

  return `${next}\n`;
}

export function isNextConfigPath(relPath: string): boolean {
  const p = relPath.replace(/^\/+/, "").replace(/\\/g, "/");
  return /^next\.config\.(ts|js|mjs|cjs)$/i.test(p);
}

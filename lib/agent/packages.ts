import { isPreinstalledPackage, resolvePackageVersion } from "@/lib/sandpack-deps";

/** Host / runtime packages the agent must not override. */
const BLOCKED = new Set([
  "next",
  "react",
  "react-dom",
  "typescript",
  "tailwindcss",
  "@tailwindcss/postcss",
  "eslint",
  "eslint-config-next",
  "webpack",
  "vite",
  "turbo",
  "npm",
  "yarn",
  "pnpm",
  "node",
  "fs",
  "path",
  "child_process",
  "puppeteer",
  "playwright",
  "sharp", // native; preview runtime already has host tooling
]);

const NPM_NAME_RE =
  /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i;

export function normalizePackageName(raw: string): string | null {
  const name = raw.trim().replace(/^npm:/, "");
  if (!name || name.length > 214) return null;
  if (name.startsWith(".") || name.startsWith("/")) return null;
  if (!NPM_NAME_RE.test(name)) return null;
  return name;
}

export function assertInstallablePackage(
  rawName: string,
  version?: string | null,
): { ok: true; name: string; version: string } | { ok: false; error: string } {
  const name = normalizePackageName(rawName);
  if (!name) {
    return { ok: false, error: `Invalid package name: "${rawName}"` };
  }
  if (BLOCKED.has(name) || name.startsWith("@types/react")) {
    return {
      ok: false,
      error: `"${name}" is provided by the preview runtime — do not install it.`,
    };
  }
  if (isPreinstalledPackage(name)) {
    return {
      ok: false,
      error: `"${name}" is already preinstalled in every preview — import it directly; do not call install_package.`,
    };
  }
  return {
    ok: true,
    name,
    version: resolvePackageVersion(name, version),
  };
}

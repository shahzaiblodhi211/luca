import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  ensureUseClientDirective,
  sanitizeGeneratedCode,
} from "@/lib/agent/sanitize-code";
import type { ProjectFile } from "@/lib/types";
import { resolvePreviewDependencies } from "./deps";
import {
  isHostOwnedPreviewPath,
  normalizePreviewCss,
} from "./normalize-css";
import {
  PREVIEW_RUNTIME_DIR,
  sanitizeChatId,
  workspaceDirFor,
} from "./paths";
import { ensureInspectorInLayout } from "./luca-inspector-layout";

function lucaAppOrigin(): string {
  return (
    process.env.LUCA_APP_ORIGIN?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    ""
  ).replace(/\/+$/, "");
}

/** Preview iframe is on another host — /api/images lives on main Luca (Vercel). */
function rewriteLucaImageApiUrls(code: string): string {
  const origin = lucaAppOrigin();
  if (!origin) return code;
  return code.replace(/(["'`])\/api\/images\//g, `$1${origin}/api/images/`);
}
import {
  resolveNextUiStubFiles,
  SCAFFOLD_GITIGNORE,
  SCAFFOLD_GLOBALS_CSS,
  SCAFFOLD_LAYOUT,
  SCAFFOLD_NEXT_CONFIG,
  SCAFFOLD_POSTCSS,
  SCAFFOLD_THEME_PROVIDER,
  SCAFFOLD_TSCONFIG,
  SCAFFOLD_UTILS,
} from "./scaffold";

function loadLucaInspectorScript(): string {
  return readFileSync(
    path.join(process.cwd(), "lib/preview/luca-inspector.js"),
    "utf8",
  );
}

export type SyncWorkspaceResult = {
  dir: string;
  depsHash: string;
  depsChanged: boolean;
};

function normalizePath(p: string): string {
  return p.replace(/^\/+/, "").replace(/\\/g, "/");
}

function filesFingerprint(files: ProjectFile[]): string {
  const h = createHash("sha256");
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    h.update(normalizePath(f.path));
    h.update("\0");
    h.update(f.code);
    h.update("\0");
  }
  return h.digest("hex");
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeText(filePath: string, contents: string) {
  await ensureDir(path.dirname(filePath));
  let prev: string | null = null;
  try {
    prev = await fs.readFile(filePath, "utf8");
  } catch {
    /* missing */
  }
  if (prev === contents) return false;
  await fs.writeFile(filePath, contents, "utf8");
  return true;
}

async function writeBinary(filePath: string, buf: Buffer) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, buf);
}

function parseDataUrl(dataUrl: string): { mime: string; buf: Buffer } | null {
  const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!m) return null;
  return { mime: m[1], buf: Buffer.from(m[2], "base64") };
}

async function linkNodeModules(workspaceDir: string) {
  const target = path.join(PREVIEW_RUNTIME_DIR, "node_modules");
  const linkPath = path.join(workspaceDir, "node_modules");
  const runtimePkg = path.join(PREVIEW_RUNTIME_DIR, "package.json");

  // Ensure runtime exists before linking
  try {
    await fs.access(target);
  } catch {
    throw new Error("Preview runtime node_modules missing — run install first");
  }

  try {
    const st = await fs.lstat(linkPath);
    if (st.isSymbolicLink() || st.isDirectory()) {
      await fs.rm(linkPath, { recursive: true, force: true });
    }
  } catch {
    /* missing */
  }

  if (process.platform === "win32") {
    await fs.symlink(target, linkPath, "junction");
  } else {
    await fs.symlink(target, linkPath, "dir");
  }

  // Keep a local package.json that mirrors runtime deps for Next resolution
  void runtimePkg;
}

export async function ensurePreviewRuntime(
  deps: Record<string, string>,
): Promise<{ depsHash: string; installed: boolean }> {
  await ensureDir(PREVIEW_RUNTIME_DIR);

  const pkg = {
    name: "luca-preview-runtime",
    private: true,
    version: "0.0.0",
    dependencies: deps,
  };
  const pkgJson = `${JSON.stringify(pkg, null, 2)}\n`;
  const depsHash = createHash("sha256").update(pkgJson).digest("hex");
  const hashPath = path.join(PREVIEW_RUNTIME_DIR, ".deps-hash");

  let prevHash: string | null = null;
  try {
    prevHash = (await fs.readFile(hashPath, "utf8")).trim();
  } catch {
    /* missing */
  }

  const nodeModules = path.join(PREVIEW_RUNTIME_DIR, "node_modules", "next");
  let hasNext = false;
  try {
    await fs.access(nodeModules);
    hasNext = true;
  } catch {
    hasNext = false;
  }

  const needsInstall = prevHash !== depsHash || !hasNext;
  await writeText(path.join(PREVIEW_RUNTIME_DIR, "package.json"), pkgJson);

  if (!needsInstall) {
    return { depsHash, installed: false };
  }

  await runNpmInstall(PREVIEW_RUNTIME_DIR);
  await writeText(hashPath, `${depsHash}\n`);
  return { depsHash, installed: true };
}

function runNpmInstall(cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["install", "--no-fund", "--no-audit", "--prefer-offline"],
      {
        cwd,
        env: { ...process.env, npm_config_progress: "false" },
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
      },
    );

    let stderr = "";
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.stdout?.on("data", () => {
      /* swallow */
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm install failed (${code}): ${stderr.slice(-2000)}`));
    });
  });
}

/**
 * Materialize agent project files into a real Next.js workspace on disk.
 */
export async function syncPreviewWorkspace(
  chatId: string,
  files: ProjectFile[],
  imageDataUrls: Record<string, string> = {},
  packages: Record<string, string> = {},
): Promise<SyncWorkspaceResult> {
  const id = sanitizeChatId(chatId);
  const dir = workspaceDirFor(id);
  await ensureDir(dir);

  const deps = resolvePreviewDependencies(files, packages);
  const { depsHash, installed } = await ensurePreviewRuntime(deps);

  const byPath = new Map<string, string>();

  // Scaffold defaults (overridden by agent files when present)
  byPath.set("lib/utils.ts", SCAFFOLD_UTILS);
  byPath.set("components/theme-provider.tsx", SCAFFOLD_THEME_PROVIDER);
  byPath.set("app/globals.css", SCAFFOLD_GLOBALS_CSS);
  byPath.set("app/layout.tsx", SCAFFOLD_LAYOUT);
  byPath.set("tsconfig.json", SCAFFOLD_TSCONFIG);
  byPath.set("postcss.config.mjs", SCAFFOLD_POSTCSS);
  byPath.set("next.config.ts", SCAFFOLD_NEXT_CONFIG);
  byPath.set(".gitignore", SCAFFOLD_GITIGNORE);

  const allCode = files.map((f) => f.code).join("\n");
  for (const [p, code] of Object.entries(resolveNextUiStubFiles(allCode))) {
    byPath.set(p, code);
  }

  for (const file of files) {
    const p = normalizePath(file.path);
    // Host-owned runtime / Tailwind v4 tooling — never let agent overwrite
    if (isHostOwnedPreviewPath(p)) continue;
    let code = file.code;
    if (/\.(tsx?|jsx?)$/i.test(p)) {
      code = sanitizeGeneratedCode(code)
        .replace(
          /from\s+["']next-themes["']/g,
          'from "@/components/theme-provider"',
        )
        .replace(
          /from\s+["']@teispace\/next-themes["']/g,
          'from "@/components/theme-provider"',
        );
      // Root layouts must stay Server Components (metadata). Skip those.
      const isRootLayout =
        p === "app/layout.tsx" || /(^|\/)layout\.tsx$/i.test(p);
      if (!isRootLayout) {
        code = ensureUseClientDirective(code);
      }
      code = rewriteLucaImageApiUrls(code);
    } else if (/\.css$/i.test(p)) {
      code = normalizePreviewCss(sanitizeGeneratedCode(file.code));
    } else if (/\.(mjs|cjs)$/i.test(p)) {
      code = sanitizeGeneratedCode(file.code);
    }
    byPath.set(p, code);
  }

  // Always re-apply host theme provider + Tailwind v4 postcss after agent files
  byPath.set("components/theme-provider.tsx", SCAFFOLD_THEME_PROVIDER);
  byPath.set("postcss.config.mjs", SCAFFOLD_POSTCSS);
  byPath.set("next.config.ts", SCAFFOLD_NEXT_CONFIG);

  // Ensure agent brand CSS still boots Tailwind v4
  const globals = byPath.get("app/globals.css");
  if (globals) {
    byPath.set("app/globals.css", normalizePreviewCss(globals));
  }
  const brandCss = byPath.get("app/brand.css");
  if (brandCss) {
    byPath.set("app/brand.css", normalizePreviewCss(brandCss));
  }

  // Ensure layout imports globals + suppressHydrationWarning on <html>
  let layout = byPath.get("app/layout.tsx");
  if (layout) {
    if (!layout.includes("globals.css")) {
      layout = `import "./globals.css";\n${layout}`;
    }
    if (!layout.includes("suppressHydrationWarning")) {
      layout = layout.replace(/<html\b/, "<html suppressHydrationWarning");
    }
    layout = ensureInspectorInLayout(layout, loadLucaInspectorScript());
    byPath.set("app/layout.tsx", layout);
  }

  byPath.set("public/luca-inspector.js", loadLucaInspectorScript());

  const workspacePkg = {
    name: `luca-preview-${id}`,
    private: true,
    version: "0.0.0",
    scripts: {
      dev: "next dev",
      build: "next build",
      start: "next start",
    },
    dependencies: deps,
  };
  byPath.set("package.json", `${JSON.stringify(workspacePkg, null, 2)}\n`);

  for (const [rel, code] of byPath) {
    await writeText(path.join(dir, rel), code);
  }

  // Remove agent-written Tailwind v3 configs (v4 uses CSS + postcss only)
  for (const stale of [
    "tailwind.config.ts",
    "tailwind.config.js",
    "tailwind.config.mjs",
    "tailwind.config.cjs",
  ]) {
    try {
      await fs.rm(path.join(dir, stale), { force: true });
    } catch {
      /* ignore */
    }
  }

  for (const [imgPath, dataUrl] of Object.entries(imageDataUrls)) {
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) continue;
    const rel = normalizePath(imgPath);
    // Prefer public/ for static assets if path looks like an asset
    const outRel =
      rel.startsWith("public/") || rel.startsWith("app/")
        ? rel
        : `public/${rel.replace(/^public\//, "")}`;
    await writeBinary(path.join(dir, outRel), parsed.buf);
  }

  await linkNodeModules(dir);

  // Fingerprint file for debugging / cache bust
  await writeText(
    path.join(dir, ".luca-sync"),
    `${filesFingerprint(files)}\n${depsHash}\n`,
  );

  return { dir, depsHash, depsChanged: installed };
}

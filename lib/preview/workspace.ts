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
  LUCA_PKG_STUB,
  rewriteDroppedPackageImports,
} from "./rewrite-dropped-imports";
import { keepInstallableDeps } from "./safe-deps";
import {
  isHostOwnedPreviewPath,
  normalizePreviewCss,
} from "./normalize-css";
import {
  PREVIEW_RUNTIME_DIR,
  sanitizeChatId,
  workspaceDirFor,
} from "./paths";
import { applyImageDataUrlsToCode } from "./image-data-urls";
import { ensureInspectorInLayout } from "./luca-inspector-layout";
import {
  ensurePreviewNextConfig,
  isNextConfigPath,
} from "./next-config-merge";
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

function lucaAppOrigin(override?: string): string {
  return (
    override?.trim() ||
    process.env.LUCA_APP_ORIGIN?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "")
  ).replace(/\/+$/, "");
}

/** Preview iframe is on another host — /api/images lives on main Luca (Vercel). */
function rewriteLucaImageApiUrls(code: string, originOverride?: string): string {
  const origin = lucaAppOrigin(originOverride);
  if (!origin) return code;
  let next = code.replace(/(["'`])\/api\/images\//g, `$1${origin}/api/images/`);
  next = next.replace(/url\(\s*\/api\/images\//g, `url(${origin}/api/images/`);
  next = next.replace(/url\(\s*['"]\/api\/images\//g, (m) =>
    m.replace("/api/images/", `${origin}/api/images/`),
  );
  next = next.replace(
    /(["'`])\/api\/attachments\//g,
    `$1${origin}/api/attachments/`,
  );
  next = next.replace(
    /url\(\s*\/api\/attachments\//g,
    `url(${origin}/api/attachments/`,
  );
  return next;
}

const API_IMAGE_ID = /\/api\/images\/([a-f0-9]{24})/gi;

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

/** Download Luca-hosted images into workspace public/ and rewrite src paths. */
async function materializeLucaApiImages(
  byPath: Map<string, string>,
  dir: string,
  originOverride?: string,
): Promise<void> {
  const origin = lucaAppOrigin(originOverride);
  if (!origin) return;

  const ids = new Set<string>();
  for (const code of byPath.values()) {
    for (const m of code.matchAll(new RegExp(API_IMAGE_ID.source, "gi"))) {
      ids.add(m[1]!.toLowerCase());
    }
  }

  const idToPublic = new Map<string, string>();
  for (const id of ids) {
    try {
      const res = await fetch(`${origin}/api/images/${id}`, {
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;
      const ct = res.headers.get("content-type") || "image/png";
      const ext = ct.includes("jpeg")
        ? "jpg"
        : ct.includes("webp")
          ? "webp"
          : ct.includes("svg")
            ? "svg"
            : "png";
      const rel = `public/luca-images/${id}.${ext}`;
      const buf = Buffer.from(await res.arrayBuffer());
      await writeBinary(path.join(dir, rel), buf);
      idToPublic.set(id, `/${rel.replace(/^public\//, "")}`);
    } catch {
      /* keep /api/images or absolute rewrite */
    }
  }

  for (const [p, code] of byPath.entries()) {
    if (!/\.(tsx?|jsx?|css|html)$/i.test(p)) continue;
    let next = code;
    for (const [id, publicPath] of idToPublic) {
      next = next.replaceAll(`/api/images/${id}`, publicPath);
    }
    byPath.set(p, next);
  }
}

const API_ATTACH_ID = /\/api\/attachments\/([A-Za-z0-9_-]+)/g;

async function materializeLucaAttachments(
  byPath: Map<string, string>,
  dir: string,
  originOverride?: string,
): Promise<void> {
  const origin = lucaAppOrigin(originOverride);
  if (!origin) return;

  const ids = new Set<string>();
  for (const code of byPath.values()) {
    for (const m of code.matchAll(new RegExp(API_ATTACH_ID.source, "g"))) {
      ids.add(m[1]!);
    }
  }
  if (!ids.size) return;

  const idToPublic = new Map<string, string>();
  for (const id of ids) {
    try {
      const res = await fetch(`${origin}/api/attachments/${id}`, {
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;
      const ct = res.headers.get("content-type") || "image/png";
      const ext = ct.includes("jpeg")
        ? "jpg"
        : ct.includes("webp")
          ? "webp"
          : ct.includes("svg")
            ? "svg"
            : "png";
      const rel = `public/luca-attachments/${id}.${ext}`;
      const buf = Buffer.from(await res.arrayBuffer());
      await writeBinary(path.join(dir, rel), buf);
      idToPublic.set(id, `/${rel.replace(/^public\//, "")}`);
    } catch {
      /* keep remote attachment URL */
    }
  }

  for (const [p, code] of byPath.entries()) {
    if (!/\.(tsx?|jsx?|css|html)$/i.test(p)) continue;
    let next = code;
    for (const [id, publicPath] of idToPublic) {
      next = next.replaceAll(`${origin}/api/attachments/${id}`, publicPath);
      next = next.replaceAll(`/api/attachments/${id}`, publicPath);
    }
    byPath.set(p, next);
  }
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

  await installPreviewDeps(PREVIEW_RUNTIME_DIR);
  await writeText(hashPath, `${depsHash}\n`);
  return { depsHash, installed: true };
}

function missingNpmPackages(log: string): string[] {
  const found = new Set<string>();
  const quoted = log.matchAll(
    /404\s+'(@?[A-Za-z0-9._~/-]+)(?:@[^']+)?'\s+is not in this registry/g,
  );
  for (const m of quoted) {
    if (m[1]) found.add(m[1]);
  }
  const encoded = log.matchAll(
    /registry\.npmjs\.org\/(@?[A-Za-z0-9._~%-]+)/g,
  );
  for (const m of encoded) {
    const name = decodeURIComponent((m[1] || "").replace(/%2f/gi, "/"));
    if (name && !name.includes("npm")) found.add(name.replace(/\/-\/.*$/, ""));
  }
  return [...found].filter((n) => n !== "npm" && !n.endsWith(".tgz"));
}

async function installPreviewDeps(cwd: string): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await runNpmInstall(cwd);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const missing = missingNpmPackages(message);
      if (!missing.length) throw err;
      const pkgPath = path.join(cwd, "package.json");
      const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8")) as {
        dependencies?: Record<string, string>;
      };
      let dropped = 0;
      for (const name of missing) {
        if (pkg.dependencies?.[name]) {
          delete pkg.dependencies[name];
          dropped += 1;
        }
      }
      if (!dropped) throw err;
      console.warn(
        `[preview] skipped missing npm package(s): ${missing.join(", ")}`,
      );
      await writeText(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    }
  }
  throw new Error("npm install failed after dropping missing packages");
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

async function pruneStaleSourceFiles(
  workspaceDir: string,
  keepRelative: Set<string>,
): Promise<void> {
  const roots = ["app", "src", "pages", "components", "lib"];
  for (const root of roots) {
    const abs = path.join(workspaceDir, root);
    try {
      await fs.access(abs);
    } catch {
      continue;
    }
    await walkPrune(abs, workspaceDir, keepRelative);
  }
}

async function walkPrune(
  dir: string,
  workspaceDir: string,
  keepRelative: Set<string>,
): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const abs = path.join(dir, ent.name);
    const rel = path.relative(workspaceDir, abs).replace(/\\/g, "/");
    if (ent.isDirectory()) {
      await walkPrune(abs, workspaceDir, keepRelative);
      try {
        const sub = await fs.readdir(abs);
        if (sub.length === 0) await fs.rmdir(abs);
      } catch {
        /* ignore */
      }
      continue;
    }
    if (!keepRelative.has(rel)) {
      await fs.rm(abs, { force: true });
    }
  }
}

/**
 * Materialize agent project files into a real Next.js workspace on disk.
 */
export async function syncPreviewWorkspace(
  chatId: string,
  files: ProjectFile[],
  imageDataUrls: Record<string, string> = {},
  packages: Record<string, string> = {},
  opts?: { lucaAppOrigin?: string },
): Promise<SyncWorkspaceResult> {
  const lucaOrigin = opts?.lucaAppOrigin;
  const id = sanitizeChatId(chatId);
  const dir = workspaceDirFor(id);
  await ensureDir(dir);

  const { deps, dropped } = await keepInstallableDeps(
    resolvePreviewDependencies(files, packages),
  );
  const droppedSet = new Set(dropped);
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
  byPath.set("lib/luca-pkg-stub.ts", LUCA_PKG_STUB);

  const allCode = files.map((f) => f.code).join("\n");
  for (const [p, code] of Object.entries(resolveNextUiStubFiles(allCode))) {
    byPath.set(p, code);
  }

  for (const file of files) {
    const p = normalizePath(file.path);
    // Host-owned runtime / Tailwind v4 tooling — never let agent overwrite
    if (isHostOwnedPreviewPath(p)) continue;
    if (isNextConfigPath(p)) {
      byPath.set(
        p,
        ensurePreviewNextConfig(sanitizeGeneratedCode(file.code)),
      );
      continue;
    }
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
      code = rewriteLucaImageApiUrls(code, lucaOrigin);
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
  if (![...byPath.keys()].some((k) => isNextConfigPath(k))) {
    byPath.set("next.config.ts", SCAFFOLD_NEXT_CONFIG);
  }

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
    let nextLayout = layout;
    if (!nextLayout.includes("globals.css")) {
      nextLayout = `import "./globals.css";\n${nextLayout}`;
    }
    if (!nextLayout.includes("suppressHydrationWarning")) {
      nextLayout = nextLayout.replace(/<html\b/, "<html suppressHydrationWarning");
    }
    nextLayout = ensureInspectorInLayout(nextLayout, loadLucaInspectorScript());
    byPath.set("app/layout.tsx", nextLayout);
  }

  if (droppedSet.size) {
    for (const [p, code] of byPath) {
      if (!/\.(tsx?|jsx?)$/i.test(p)) continue;
      byPath.set(p, rewriteDroppedPackageImports(code, droppedSet));
    }
  }

  byPath.set("public/luca-inspector.js", loadLucaInspectorScript());

  const workspacePkg = {
    name: `luca-preview-${id}`,
    private: true,
    version: "0.0.0",
    scripts: {
      dev: "next dev --webpack",
      build: "next build",
      start: "next start",
    },
    dependencies: deps,
  };
  byPath.set("package.json", `${JSON.stringify(workspacePkg, null, 2)}\n`);

  for (const [p, code] of byPath.entries()) {
    if (/\.(tsx?|jsx?|css|html)$/i.test(p)) {
      let next = applyImageDataUrlsToCode(code, imageDataUrls);
      next = rewriteLucaImageApiUrls(next, lucaOrigin);
      byPath.set(p, next);
    }
  }

  await materializeLucaApiImages(byPath, dir, lucaOrigin);
  await materializeLucaAttachments(byPath, dir, lucaOrigin);

  await Promise.all(
    [...byPath].map(([rel, code]) => writeText(path.join(dir, rel), code)),
  );

  await pruneStaleSourceFiles(dir, new Set(byPath.keys()));

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

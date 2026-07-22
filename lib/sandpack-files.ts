import type { ProjectFile } from "./types";
import { resolveUiStubFiles } from "./sandpack-ui";

const STYLES = `html, body, #root {
  margin: 0;
  min-height: 100%;
  height: 100%;
}
/* Neutral host — page root must set bg + text (supports dark themes). */
body {
  font-family: ui-sans-serif, system-ui, sans-serif;
  background: transparent;
  color: inherit;
}
#root {
  min-height: 100%;
}
`;

const UTILS = `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Proper merge so later classes like bg-blue-600 beat stub defaults like bg-zinc-900. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`;

const DEFAULT_APP = `export default function App() {
  return (
    <div style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>Preview</h1>
      <p>Generate a component to see it here.</p>
    </div>
  );
}
`;

/** Sandpack is react-ts — not a real Next runtime. Shim common next/* imports. */
const NEXT_IMAGE_SHIM = `import * as React from "react";

type ImgProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string | { src: string };
  alt: string;
  width?: number | string;
  height?: number | string;
  fill?: boolean;
  priority?: boolean;
  quality?: number;
  sizes?: string;
  unoptimized?: boolean;
  placeholder?: string;
  blurDataURL?: string;
  loader?: unknown;
};

export default function Image({
  src,
  alt,
  width,
  height,
  fill,
  style,
  className,
  ...rest
}: ImgProps) {
  void rest.priority;
  void rest.quality;
  void rest.sizes;
  void rest.unoptimized;
  void rest.placeholder;
  void rest.blurDataURL;
  void rest.loader;
  const url = typeof src === "string" ? src : src?.src || "";
  if (fill) {
    return (
      <img
        src={url}
        alt={alt}
        className={className}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          ...style,
        }}
      />
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      width={width}
      height={height}
      className={className}
      style={style}
    />
  );
}
`;

const NEXT_LINK_SHIM = `import * as React from "react";

type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean;
};

export default function Link({ href, children, ...props }: LinkProps) {
  void props.replace;
  void props.scroll;
  void props.prefetch;
  return (
    <a href={href || "#"} {...props}>
      {children}
    </a>
  );
}
`;

const NEXT_NAVIGATION_SHIM = `export function useRouter() {
  return {
    push: (_href?: string) => {},
    replace: (_href?: string) => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: (_href?: string) => {},
    pathname: "/",
    query: {},
    asPath: "/",
  };
}
export function usePathname() {
  return "/";
}
export function useSearchParams() {
  return new URLSearchParams();
}
export function useParams<T extends Record<string, string> = Record<string, string>>() {
  return {} as T;
}
export function redirect(_href: string) {}
export function notFound() {}
export function permanentRedirect(_href: string) {}
`;

const NEXT_HEAD_SHIM = `import * as React from "react";
export default function Head({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}
`;

const NEXT_DYNAMIC_SHIM = `import * as React from "react";
export default function dynamic(
  loader: () => Promise<{ default: React.ComponentType<any> }>,
  _opts?: { ssr?: boolean; loading?: () => React.ReactNode },
) {
  const Lazy = React.lazy(loader);
  return function DynamicComponent(props: any) {
    return (
      <React.Suspense fallback={_opts?.loading?.() ?? null}>
        <Lazy {...props} />
      </React.Suspense>
    );
  };
}
`;

const R3F_CANVAS_SHIM = `import * as React from "react";

/** CSS starfield stand-in — real WebGL/R3F breaks Sandpack React peers. */
export function Canvas({
  children,
  className,
  style,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) {
  void children;
  void rest;
  return (
    <div
      className={className}
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background:
          "radial-gradient(ellipse at bottom, #1b2735 0%, #090a0f 100%)",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(1px 1px at 10% 20%, #fff, transparent), radial-gradient(1px 1px at 30% 60%, rgba(255,255,255,.9), transparent), radial-gradient(1.5px 1.5px at 70% 30%, #fff, transparent), radial-gradient(1px 1px at 85% 75%, rgba(255,255,255,.7), transparent), radial-gradient(1px 1px at 50% 50%, #fff, transparent)",
          backgroundSize: "220px 220px",
          opacity: 0.7,
          animation: "shim-twinkle 8s linear infinite",
        }}
      />
      <style>{\`@keyframes shim-twinkle { from { transform: translateY(0); } to { transform: translateY(-220px); } }\`}</style>
    </div>
  );
}

export function useFrame(_cb?: unknown) {}
export function useThree() {
  return {
    camera: {},
    scene: {},
    gl: { domElement: null },
    size: { width: 0, height: 0 },
    viewport: { width: 0, height: 0 },
  };
}
export function useLoader() { return null; }
export const invalidate = () => {};
export default { Canvas, useFrame, useThree };
`;

const DREI_SHIM = `import * as React from "react";

export function Stars(_props?: unknown) {
  return null;
}
export function Float({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}
export function OrbitControls() { return null; }
export function Environment() { return null; }
export function PerspectiveCamera() { return null; }
export function Html({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}
export function Text() { return null; }
export function MeshDistortMaterial() { return null; }
export function Sparkles() { return null; }
export function Sky() { return null; }
export function Cloud() { return null; }
export default { Stars, Float };
`;

const THREE_SHIM = `export class Color {
  constructor(..._args: unknown[]) {}
  set() { return this; }
}
export class Vector3 {
  constructor(public x = 0, public y = 0, public z = 0) {}
}
export class Vector2 {
  constructor(public x = 0, public y = 0) {}
}
export default { Color, Vector3, Vector2 };
`;

function rewritePreviewImports(code: string): string {
  return code
    .replace(
      /from\s+["']next\/image["']/g,
      'from "/shims/next-image.tsx"',
    )
    .replace(
      /from\s+["']next\/link["']/g,
      'from "/shims/next-link.tsx"',
    )
    .replace(
      /from\s+["']next\/navigation["']/g,
      'from "/shims/next-navigation.ts"',
    )
    .replace(
      /from\s+["']next\/router["']/g,
      'from "/shims/next-navigation.ts"',
    )
    .replace(
      /from\s+["']next\/head["']/g,
      'from "/shims/next-head.tsx"',
    )
    .replace(
      /from\s+["']next\/dynamic["']/g,
      'from "/shims/next-dynamic.tsx"',
    )
    .replace(
      /from\s+["']next\/font\/google["']/g,
      'from "/shims/next-font.ts"',
    )
    .replace(
      /from\s+["']next\/font\/local["']/g,
      'from "/shims/next-font.ts"',
    )
    .replace(/from\s+["']next["']/g, 'from "/shims/next.ts"')
    // WebGL stack is unreliable in Sandpack — use CSS shims
    .replace(
      /from\s+["']@react-three\/fiber["']/g,
      'from "/shims/react-three-fiber.tsx"',
    )
    .replace(
      /from\s+["']@react-three\/drei["']/g,
      'from "/shims/react-three-drei.tsx"',
    )
    .replace(
      /from\s+["']three["']/g,
      'from "/shims/three.ts"',
    )
    .replace(
      /from\s+["']three\/[^"']+["']/g,
      'from "/shims/three.ts"',
    );
}

const NEXT_FONT_SHIM = `export function Inter(opts?: { subsets?: string[] }) {
  void opts;
  return { className: "", style: { fontFamily: "system-ui, sans-serif" }, variable: "" };
}
export function Roboto(opts?: { subsets?: string[]; weight?: string | string[] }) {
  void opts;
  return { className: "", style: { fontFamily: "system-ui, sans-serif" }, variable: "" };
}
export function Geist(opts?: { subsets?: string[] }) {
  void opts;
  return { className: "", style: { fontFamily: "system-ui, sans-serif" }, variable: "" };
}
export function Geist_Mono(opts?: { subsets?: string[] }) {
  void opts;
  return { className: "", style: { fontFamily: "ui-monospace, monospace" }, variable: "" };
}
export default function localFont(_opts?: unknown) {
  return { className: "", style: { fontFamily: "system-ui, sans-serif" }, variable: "" };
}
`;

const NEXT_ROOT_SHIM = `export default {};
`;

function normalizePath(path: string): string {
  return `/${path.replace(/^\.\//, "").replace(/^\/+/, "")}`;
}

function stripUseClient(code: string): string {
  return code
    .replace(/^['"]use client['"];?\s*/m, "")
    .replace(/NodeJS\.Timeout/g, "ReturnType<typeof setInterval>")
    .replace(/NodeJS\.Timer/g, "ReturnType<typeof setInterval>");
}

function dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  if (idx <= 0) return "/";
  return path.slice(0, idx) || "/";
}

function resolveRelative(fromDir: string, spec: string): string {
  const parts = fromDir.split("/").filter(Boolean);
  for (const part of spec.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return `/${parts.join("/")}`;
}

function resolveAlias(
  spec: string,
  fileMap: Map<string, string>,
): string {
  const cleaned = spec.replace(/^@\//, "/").replace(/^\/+/, "/");

  const candidates = [
    cleaned,
    `${cleaned}.tsx`,
    `${cleaned}.ts`,
    `${cleaned}.jsx`,
    `${cleaned}.js`,
    `${cleaned}/index.tsx`,
    `${cleaned}/index.ts`,
    `${cleaned}/index.jsx`,
    `${cleaned}/index.js`,
  ];

  for (const c of candidates) {
    if (fileMap.has(c)) return c;
  }

  if (cleaned.startsWith("/components/ui/")) {
    const base = cleaned.replace(/\.(tsx|ts|jsx|js)$/, "");
    return `${base}.tsx`;
  }

  return cleaned.endsWith(".tsx") ||
    cleaned.endsWith(".ts") ||
    cleaned.endsWith(".jsx") ||
    cleaned.endsWith(".js")
    ? cleaned
    : `${cleaned}.tsx`;
}

function rewriteImports(
  code: string,
  fileMap: Map<string, string>,
  fromPath: string,
): string {
  return code.replace(
    /from\s+["']([^"']+)["']/g,
    (full, spec: string) => {
      if (spec.startsWith("@/")) {
        return `from "${resolveAlias(`/${spec.slice(2)}`, fileMap)}"`;
      }

      if (spec.startsWith("./") || spec.startsWith("../")) {
        const absolute = resolveRelative(dirname(fromPath), spec);
        return `from "${resolveAlias(absolute, fileMap)}"`;
      }

      if (spec.startsWith("/") && !spec.startsWith("//")) {
        const normalized = spec.replace(/^\/\.\.\//, "/").replace(/\/\.\.\//g, "/");
        const absolute = normalized.includes("..")
          ? resolveRelative("/", normalized.replace(/^\//, ""))
          : normalized;
        return `from "${resolveAlias(absolute, fileMap)}"`;
      }

      return full;
    },
  );
}

function pickEntry(files: Record<string, string>): string | null {
  const candidates = [
    "/app/page.tsx",
    "/app/page.jsx",
    "/app/page.js",
    "/page.tsx",
    "/page.jsx",
    "/page.js",
    "/App.tsx",
    "/App.jsx",
    "/App.js",
    "/index.tsx",
    "/index.jsx",
    "/index.js",
  ];
  for (const c of candidates) {
    if (files[c]) return c;
  }
  return (
    Object.keys(files).find(
      (p) =>
        /\.(t|j)sx?$/.test(p) &&
        !p.includes("/components/ui/") &&
        !p.endsWith("/lib/utils.ts"),
    ) || null
  );
}

function applyDataUrls(code: string, imageDataUrls: Record<string, string>): string {
  if (!imageDataUrls || !Object.keys(imageDataUrls).length) return code;
  let next = code;
  for (const [path, dataUrl] of Object.entries(imageDataUrls)) {
    const variants = [
      path,
      path.replace(/^\//, ""),
      path.startsWith("/") ? path : `/${path}`,
      path.replace(/^public\//, "/"),
      path.startsWith("public/") ? `/${path.slice("public/".length)}` : path,
    ];
    for (const variant of [...new Set(variants)]) {
      if (!variant || variant.startsWith("data:")) continue;
      next = next.split(`"${variant}"`).join(`"${dataUrl}"`);
      next = next.split(`'${variant}'`).join(`'${dataUrl}'`);
      next = next.split(`\`${variant}\``).join(`\`${dataUrl}\``);
    }
  }
  return next;
}

export function toSandpackFiles(
  projectFiles: ProjectFile[],
  imageDataUrls: Record<string, string> = {},
): {
  files: Record<string, { code: string }>;
  activeFile: string;
} {
  if (!projectFiles.length) {
    return {
      files: {
        "/App.tsx": { code: DEFAULT_APP },
        "/styles.css": { code: STYLES },
      },
      activeFile: "/App.tsx",
    };
  }

  const projectCode = projectFiles.map((f) => f.code).join("\n");
  const uiFiles = resolveUiStubFiles(projectCode);

  const files: Record<string, string> = {
    "/styles.css": STYLES,
    "/lib/utils.ts": UTILS,
    "/shims/next-image.tsx": NEXT_IMAGE_SHIM,
    "/shims/next-link.tsx": NEXT_LINK_SHIM,
    "/shims/next-navigation.ts": NEXT_NAVIGATION_SHIM,
    "/shims/next-head.tsx": NEXT_HEAD_SHIM,
    "/shims/next-dynamic.tsx": NEXT_DYNAMIC_SHIM,
    "/shims/next-font.ts": NEXT_FONT_SHIM,
    "/shims/next.ts": NEXT_ROOT_SHIM,
    "/shims/react-three-fiber.tsx": R3F_CANVAS_SHIM,
    "/shims/react-three-drei.tsx": DREI_SHIM,
    "/shims/three.ts": THREE_SHIM,
    ...uiFiles,
  };

  for (const file of projectFiles) {
    const path = normalizePath(file.path);
    if (/\.(png|jpe?g|gif|webp|svg)$/i.test(path)) continue;
    // Don't let generated junk overwrite our UI stubs unless it's a real custom override
    if (path.startsWith("/components/ui/") && files[path]) continue;
    files[path] = applyDataUrls(
      rewritePreviewImports(stripUseClient(file.code)),
      imageDataUrls,
    );
  }

  // Second pass: catch ui imports after any path rewrites in project files
  const moreUi = resolveUiStubFiles(Object.values(files).join("\n"));
  for (const [path, code] of Object.entries(moreUi)) {
    if (!files[path]) files[path] = code;
  }

  const fileMap = new Map(Object.keys(files).map((p) => [p, p]));

  for (const path of Object.keys(files)) {
    if (path.endsWith(".css") || path.startsWith("/shims/")) continue;
    files[path] = rewriteImports(
      rewritePreviewImports(files[path]),
      fileMap,
      path,
    );
  }

  // After rewrite, ensure any unresolved ui paths still have stubs
  const rewrittenCode = Object.values(files).join("\n");
  const finalUi = resolveUiStubFiles(rewrittenCode);
  for (const [path, code] of Object.entries(finalUi)) {
    if (!files[path]) {
      files[path] = rewriteImports(code, fileMap, path);
      fileMap.set(path, path);
    }
  }

  const entry = pickEntry(files) || "/App.tsx";

  if (!files["/App.tsx"] && !files["/App.jsx"] && !files["/App.js"]) {
    const importPath = resolveAlias(entry, fileMap);
    files["/App.tsx"] = `import "./styles.css";
import Entry from "${importPath}";

export default function App() {
  return <Entry />;
}
`;
  } else if (files["/App.tsx"]) {
    if (!files["/App.tsx"].includes("./styles.css") && !files["/App.tsx"].includes("/styles.css")) {
      files["/App.tsx"] = `import "./styles.css";\n${files["/App.tsx"]}`;
    }
  }

  files["/App.tsx"] = rewriteImports(files["/App.tsx"], fileMap, "/App.tsx");

  return {
    files: Object.fromEntries(
      Object.entries(files).map(([path, code]) => [path, { code }]),
    ),
    activeFile: files[entry] ? entry : "/App.tsx",
  };
}

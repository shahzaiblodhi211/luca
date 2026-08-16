import type { LayoutBox } from "./figma-layout";
import type { ProjectFile } from "./types";
import { filesHaveFigmaCanvas } from "./figma-canvas";
import { extractCatalog, slugify, type CatalogProduct } from "./figma-app";

export type FigmaFrameKind =
  | "home"
  | "product"
  | "shop"
  | "about"
  | "journal"
  | "page";

const SHELL_PATHS = new Set([
  "app/globals.css",
  "app/layout.tsx",
  "components/site-life.tsx",
]);

function collectText(box: LayoutBox, limit = 400): string {
  const parts: string[] = [];
  const walk = (node: LayoutBox) => {
    if (node.text) parts.push(node.text);
    if (parts.join(" ").length >= limit) return;
    for (const child of node.children) walk(child);
  };
  walk(box);
  return parts.join(" ").slice(0, limit);
}

function largestPhoto(root: LayoutBox): LayoutBox | undefined {
  let best: LayoutBox | undefined;
  const walk = (box: LayoutBox) => {
    if (box.assetUrl && !box.icon && box.w >= 120 && box.h >= 120) {
      if (!best || box.w * box.h > best.w * best.h) best = box;
    }
    box.children.forEach(walk);
  };
  walk(root);
  return best;
}

export function classifyFigmaFrame(
  root: LayoutBox,
  frameName: string,
  existingHome = false,
): FigmaFrameKind {
  const name = `${frameName} ${root.name}`.toLowerCase();
  if (/pdp|detail|product view|product page|商品詳細|item detail|item page/.test(name)) {
    return "product";
  }
  if (/\b(shop|collection|catalog|plp|一覧)\b/.test(name) && !/home|landing/.test(name)) {
    return "shop";
  }
  if (/\b(about|story|ブランドストーリー)\b/.test(name) && !/home|journal/.test(name)) {
    return "about";
  }
  if (/\b(journal|blog|article)\b/.test(name)) return "journal";
  if (/\b(home|landing|top|index|メイン|トップ)\b/.test(name)) return "home";

  const products = extractCatalog(structuredClone(root));
  const sections = root.children.filter((child) => child.h > 160).length;
  const blob = collectText(root);
  const hasPrice = /[¥$€£]\s*\d|\d[\d,.]+\s*円/.test(blob);
  const photo = largestPhoto(root);

  if (existingHome) {
    if (products.length >= 4 && root.h >= 2400 && sections >= 4) return "home";
    if (hasPrice && products.length <= 2 && sections <= 7) return "product";
    if (products.length >= 3 && root.h < 2800) return "shop";
    if (hasPrice && photo && root.h < 3200) return "product";
    return "page";
  }

  if (root.h >= 2400 && sections >= 4) return "home";
  if (products.length >= 4) return "home";
  if (hasPrice && products.length <= 1 && sections <= 6) return "product";
  return "home";
}

export function routeForKind(kind: FigmaFrameKind, frameName: string): string {
  switch (kind) {
    case "home":
      return "app/page.tsx";
    case "product":
      return "app/product/[slug]/page.tsx";
    case "shop":
      return "app/shop/page.tsx";
    case "about":
      return "app/about/page.tsx";
    case "journal":
      return "app/journal/page.tsx";
    default:
      return `app/${slugify(frameName) || "page"}/page.tsx`;
  }
}

export function markProductBinds(root: LayoutBox): void {
  const texts: LayoutBox[] = [];
  const images: LayoutBox[] = [];
  const walk = (box: LayoutBox) => {
    if (box.text) texts.push(box);
    if (box.assetUrl && !box.icon && box.w >= 72 && box.h >= 72) images.push(box);
    box.children.forEach(walk);
  };
  walk(root);

  const price = texts.find((t) => /[¥$€£]\s*\d|\d[\d,.]+\s*円/.test(t.text || ""));
  if (price) price.bind = "price";

  const name = texts
    .filter(
      (t) =>
        t !== price &&
        (t.text || "").length >= 2 &&
        (t.text || "").length <= 48 &&
        !/add to cart|buy|購入|cart|カート/.test(t.text || ""),
    )
    .sort(
      (a, b) =>
        (b.fontWeight || 0) - (a.fontWeight || 0) || b.w * b.h - a.w * a.h,
    )[0];
  if (name) name.bind = "name";

  images.sort((a, b) => b.w * b.h - a.w * a.h);
  const hero = images[0];
  if (!hero) return;
  hero.bind = "image";
  hero.bindIndex = 0;
  images
    .filter((img) => img !== hero)
    .slice(0, 5)
    .forEach((img, i) => {
      img.bind = "image";
      img.bindIndex = i + 1;
    });
}

export function extractPrimaryProduct(
  root: LayoutBox,
  frameName: string,
): CatalogProduct | null {
  let name = frameName.replace(/pdp|detail|product page/gi, "").trim() || frameName;
  let price = "";
  const images: string[] = [];
  const walk = (box: LayoutBox) => {
    if (box.bind === "name" && box.text) name = box.text.trim();
    if (box.bind === "price" && box.text) price = box.text.trim();
    if (box.bind === "image" && box.assetUrl) {
      images[box.bindIndex || 0] = box.assetUrl;
    }
    box.children.forEach(walk);
  };
  walk(root);
  const list = images.filter(Boolean);
  if (!list.length && !name) return null;
  return {
    id: root.id,
    slug: slugify(name),
    name,
    price,
    image: list[0] || "",
    images: list,
  };
}

function parseExportArray(code: string, name: string): Array<Record<string, unknown>> {
  const match = code.match(
    new RegExp(`export const ${name}[^=]*=\\s*(\\[[\\s\\S]*?\\n\\]);`),
  );
  if (!match?.[1]) return [];
  try {
    const parsed = JSON.parse(match[1]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function uniqueBySlug(
  items: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  const out: Array<Record<string, unknown>> = [];
  for (const item of items) {
    const slug = String(item.slug || item.image || "");
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(item);
  }
  return out;
}

export function mergeCatalogCode(prev: string | undefined, next: string): string {
  if (!prev?.includes("export const products")) return next;
  const products = uniqueBySlug([
    ...parseExportArray(prev, "products"),
    ...parseExportArray(next, "products"),
  ]);
  const posts = uniqueBySlug([
    ...parseExportArray(prev, "posts"),
    ...parseExportArray(next, "posts"),
  ]);
  return next
    .replace(
      /export const products: Product\[\] = \[[\s\S]*?\n\];/,
      `export const products: Product[] = ${JSON.stringify(products, null, 2)};`,
    )
    .replace(
      /export const posts: Post\[\] = \[[\s\S]*?\n\];/,
      `export const posts: Post[] = ${JSON.stringify(posts, null, 2)};`,
    );
}

export function mergeFigmaProject(
  existing: ProjectFile[],
  incoming: ProjectFile[],
  kind: FigmaFrameKind,
): ProjectFile[] {
  if (!filesHaveFigmaCanvas(existing)) return incoming;

  const map = new Map(
    existing.map((file) => [file.path.replace(/^\/+/, ""), file]),
  );

  for (const file of incoming) {
    const path = file.path.replace(/^\/+/, "");
    if (SHELL_PATHS.has(path)) continue;
    if (path === "app/page.tsx" && kind !== "home") continue;
    if (path === "lib/catalog.ts") {
      const prev = map.get(path);
      map.set(path, {
        ...file,
        path,
        code: mergeCatalogCode(prev?.code, file.code),
      });
      continue;
    }
    map.set(path, { ...file, path });
  }

  return [...map.values()];
}

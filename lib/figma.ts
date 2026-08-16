/**
 * Figma file inspect — uses the signed-in user's connected Figma token
 * so a pasted share link opens files they already have access to.
 */

import {
  parseFigmaUrl,
  type FigmaRef,
} from "./figma-url";
import {
  buildLayoutTree,
  buildSkeletonFiles,
  formatCanvasSpec,
} from "./figma-layout";
import { classifyFigmaFrame, routeForKind } from "./figma-frame";
import { resolveGoogleFont } from "./figma-fonts";
import { Agent, fetch as undiciFetch } from "undici";
import type { ProjectFile } from "./types";

const figmaDownloadAgent = new Agent({
  connectTimeout: 60_000,
  headersTimeout: 90_000,
  bodyTimeout: 120_000,
  connections: 4,
});

export type { FigmaRef };
export { extractFigmaUrls, isFigmaUrl, parseFigmaUrl } from "./figma-url";

export type FigmaShot = {
  mimeType: string;
  base64: string;
  label: string;
};

export type FigmaInspect = {
  ref: FigmaRef;
  title: string;
  brief: string;
  shots: FigmaShot[];
  imageUrls: string[];
  requiredTokens: string[];
  skeletonFiles?: ProjectFile[];
  frameKind?: import("./figma-frame").FigmaFrameKind;
  frameRoute?: string;
};

type FigmaColor = { r: number; g: number; b: number; a?: number };

type FigmaNode = {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  absoluteBoundingBox?: { x?: number; y?: number; width: number; height: number };
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL";
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  cornerRadius?: number;
  rectangleCornerRadii?: number[];
  strokes?: Array<{ type?: string; visible?: boolean; color?: FigmaColor }>;
  strokeWeight?: number;
  opacity?: number;
  fills?: Array<{
    type?: string;
    visible?: boolean;
    color?: FigmaColor;
    imageRef?: string;
    scaleMode?: string;
    gradientHandlePositions?: Array<{ x: number; y: number }>;
    gradientStops?: Array<{ color: FigmaColor; position: number }>;
  }>;
  effects?: Array<{
    type?: string;
    visible?: boolean;
    radius?: number;
    offset?: { x?: number; y?: number };
    color?: FigmaColor;
  }>;
  style?: {
    fontFamily?: string;
    fontWeight?: number;
    fontSize?: number;
    lineHeightPx?: number;
    letterSpacing?: number;
    textAlignHorizontal?: string;
    textAlignVertical?: string;
  };
  characters?: string;
  children?: FigmaNode[];
  transitionNodeID?: string;
  reactions?: Array<{
    actions?: Array<{ type?: string; url?: string; destinationId?: string }>;
    action?: { type?: string; url?: string; destinationId?: string };
  }>;
};

type AssetNeed = {
  id: string;
  name: string;
  role: "bg" | "photo" | "icon" | "logo";
  w: number;
  h: number;
  scaleMode: string;
  imageRef?: string;
  parentId?: string;
  hasSolid?: boolean;
};

function rgbToHex(c: FigmaColor): string {
  const h = (n: number) =>
    Math.round(Math.min(1, Math.max(0, n)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

function unique(items: string[]): string[] {
  return [...new Set(items.map((s) => s.trim()).filter(Boolean))];
}

function pickAssets(assets: AssetNeed[]): AssetNeed[] {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const iconIds = new Set(
    assets.filter((a) => a.role === "icon" || a.role === "logo").map((a) => a.id),
  );
  const usable = assets.filter((a) => {
    if (a.role !== "icon" && a.role !== "logo") return true;
    let pid = a.parentId;
    while (pid) {
      if (iconIds.has(pid)) return false;
      pid = byId.get(pid)?.parentId;
    }
    return true;
  });
  const seen = new Set<string>();
  const out: AssetNeed[] = [];
  const take = (role: AssetNeed["role"], max: number) => {
    for (const a of usable) {
      if (out.length >= 140) return;
      if (a.role !== role || seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a);
      if (out.filter((x) => x.role === role).length >= max) return;
    }
  };
  take("bg", 24);
  take("logo", 8);
  take("photo", 72);
  take("icon", 40);
  return out;
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (!items.length) return;
  let i = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (i < items.length) {
        const item = items[i++];
        try {
          await fn(item);
        } catch (err) {
          console.warn("[figma] asset job failed", err);
        }
      }
    },
  );
  await Promise.all(workers);
}

function isInvalidTokenError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /invalid token/i.test(msg);
}

async function figmaGet<T>(path: string, accessToken: string): Promise<T> {
  const url = `https://api.figma.com/v1${path}`;
  const token = accessToken.trim();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  if (res.ok) return (await res.json()) as T;
  const body = await res.text().catch(() => "");
  throw new Error(
    `Figma API ${res.status}: ${body.slice(0, 240) || res.statusText}`,
  );
}

type WalkAcc = {
  frames: Array<{ id: string; name: string; w: number; h: number }>;
  colors: string[];
  fonts: string[];
  texts: string[];
  imageRefs: string[];
  exportIds: string[];
  layers: string[];
  assets: AssetNeed[];
  navItems: string[];
  ctas: string[];
};

function slugName(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "asset"
  );
}

function solidFill(node: FigmaNode): string | undefined {
  for (const fill of node.fills || []) {
    if (fill.visible === false) continue;
    if (fill.type === "SOLID" && fill.color) return rgbToHex(fill.color);
  }
  return undefined;
}

function googleFontImport(family: string): string | null {
  return resolveGoogleFont(family);
}

function hasImageDescendant(node: FigmaNode): boolean {
  for (const child of node.children || []) {
    if (imageFill(child) || hasImageDescendant(child)) return true;
  }
  return false;
}

function hasTextDescendant(node: FigmaNode): boolean {
  for (const child of node.children || []) {
    if (child.type === "TEXT" && child.characters?.trim()) return true;
    if (hasTextDescendant(child)) return true;
  }
  return false;
}

function imageFill(node: FigmaNode): { imageRef?: string; scaleMode: string } | null {
  for (const fill of node.fills || []) {
    if (fill.visible === false) continue;
    if (fill.type === "IMAGE") {
      return {
        imageRef: fill.imageRef,
        scaleMode: (fill.scaleMode || "FILL").toUpperCase(),
      };
    }
  }
  return null;
}

function assetRole(
  node: FigmaNode,
  w: number,
  h: number,
): AssetNeed["role"] {
  const name = node.name || "";
  if (/logo|wordmark|brand/i.test(name)) return "logo";
  if (/icon|chevron|arrow|menu|search|cart|close/i.test(name) || (w <= 200 && h <= 200)) {
    return "icon";
  }
  const type = node.type || "";
  if (
    (type === "FRAME" || type === "RECTANGLE" || type === "COMPONENT" || type === "INSTANCE") &&
    w >= 360 &&
    h >= 180
  ) {
    return "bg";
  }
  return "photo";
}

function shadowHint(node: FigmaNode): string {
  for (const fx of node.effects || []) {
    if (fx.visible === false) continue;
    if (fx.type === "DROP_SHADOW" || fx.type === "INNER_SHADOW") {
      const x = Math.round(fx.offset?.x || 0);
      const y = Math.round(fx.offset?.y || 0);
      const r = Math.round(fx.radius || 0);
      const c = fx.color ? rgbToHex(fx.color) : "#000";
      return `shadow ${x}px ${y}px ${r}px ${c}`;
    }
  }
  return "";
}

function layoutHint(node: FigmaNode): string {
  const bits: string[] = [];
  if (node.layoutMode === "VERTICAL") bits.push("flex-col");
  else if (node.layoutMode === "HORIZONTAL") bits.push("flex-row");
  else bits.push("absolute-children");
  if (node.itemSpacing != null) bits.push(`gap ${Math.round(node.itemSpacing)}px`);
  const p = [
    node.paddingTop,
    node.paddingRight,
    node.paddingBottom,
    node.paddingLeft,
  ];
  if (p.some((n) => n != null && n > 0)) {
    bits.push(
      `pad ${Math.round(p[0] || 0)}/${Math.round(p[1] || 0)}/${Math.round(p[2] || 0)}/${Math.round(p[3] || 0)}px`,
    );
  }
  if (node.primaryAxisAlignItems) bits.push(`main=${node.primaryAxisAlignItems}`);
  if (node.counterAxisAlignItems) bits.push(`cross=${node.counterAxisAlignItems}`);
  if (node.cornerRadius) bits.push(`radius ${Math.round(node.cornerRadius)}px`);
  if (node.strokeWeight && node.strokes?.some((s) => s.visible !== false)) {
    const sc = node.strokes?.find((s) => s.color)?.color;
    bits.push(`border ${Math.round(node.strokeWeight)}px ${sc ? rgbToHex(sc) : ""}`.trim());
  }
  const sh = shadowHint(node);
  if (sh) bits.push(sh);
  if (node.opacity != null && node.opacity < 1) bits.push(`opacity ${node.opacity}`);
  return bits.join(" · ");
}

function walk(
  node: FigmaNode | undefined,
  acc: WalkAcc,
  depth = 0,
  parentBox?: { x: number; y: number },
  rootId?: string,
  inNav = false,
  parentId?: string,
) {
  if (!node || node.visible === false || depth > 20) return;
  const type = node.type || "";
  const box = node.absoluteBoundingBox;
  const w = Math.round(box?.width || 0);
  const h = Math.round(box?.height || 0);
  const x = box && parentBox ? Math.round((box.x || 0) - parentBox.x) : 0;
  const y = box && parentBox ? Math.round((box.y || 0) - parentBox.y) : 0;
  const thisBox = box
    ? { x: box.x || 0, y: box.y || 0 }
    : parentBox;

  if (
    (type === "FRAME" ||
      type === "COMPONENT" ||
      type === "COMPONENT_SET" ||
      type === "SECTION" ||
      type === "INSTANCE") &&
    w >= 200 &&
    h >= 120
  ) {
    acc.frames.push({ id: node.id, name: node.name || type, w, h });
  }

  const navBar =
    inNav ||
    ((type === "FRAME" || type === "COMPONENT" || type === "INSTANCE") &&
      w >= 600 &&
      h > 0 &&
      h <= 140 &&
      (node.layoutMode === "HORIZONTAL" ||
        /nav|header|menu/i.test(node.name || "")));

  if (type === "TEXT" && navBar && node.characters?.trim()) {
    const t = node.characters.replace(/\s+/g, " ").trim();
    if (t.length <= 22 && t.split(" ").length <= 3) acc.navItems.push(t);
  }

  if (
    (type === "FRAME" || type === "INSTANCE" || type === "COMPONENT") &&
    h >= 28 &&
    h <= 72 &&
    w >= 60 &&
    w <= 360
  ) {
    const label = (node.children || []).find(
      (c) => c.type === "TEXT" && c.characters?.trim(),
    );
    if (label?.characters) {
      const fill = solidFill(node);
      const r = node.cornerRadius ? ` r${Math.round(node.cornerRadius)}` : "";
      acc.ctas.push(
        `${label.characters.replace(/\s+/g, " ").trim()} · ${w}×${h}${fill ? ` ${fill}` : ""}${r}`,
      );
    }
  }

  const img = imageFill(node);
  for (const fill of node.fills || []) {
    if (fill.visible === false) continue;
    if (fill.type === "SOLID" && fill.color) acc.colors.push(rgbToHex(fill.color));
    if (fill.type === "IMAGE" && fill.imageRef) acc.imageRefs.push(fill.imageRef);
  }

  if (img && node.id !== rootId) {
    const role = assetRole(node, w, h);
    acc.assets.push({
      id: node.id,
      name: node.name || type,
      role,
      w,
      h,
      scaleMode:
        img.scaleMode === "FIT" || (w <= 280 && h <= 280 && role !== "bg")
          ? "contain"
          : "cover",
      imageRef: img.imageRef,
      parentId,
      hasSolid: Boolean(solidFill(node)),
    });
    acc.exportIds.push(node.id);
  }

  const parentIsIcon = Boolean(
    parentId &&
      acc.assets.some(
        (a) => a.id === parentId && (a.role === "icon" || a.role === "logo"),
      ),
  );
  const iconish =
    /icon|logo|mark|avatar|badge|chevron|arrow|menu|search|cart|instagram|bag/i.test(
      node.name || "",
    ) ||
    (w > 0 && h > 0 && w <= 160 && h <= 160);
  if (
    !img &&
    iconish &&
    !parentIsIcon &&
    node.id !== rootId &&
    !hasImageDescendant(node) &&
    !(type === "GROUP" && hasTextDescendant(node) && (w > 160 || h > 160)) &&
    (type === "VECTOR" ||
      type === "BOOLEAN_OPERATION" ||
      type === "COMPONENT" ||
      type === "INSTANCE" ||
      type === "ELLIPSE" ||
      type === "STAR" ||
      type === "LINE" ||
      type === "GROUP")
  ) {
    acc.assets.push({
      id: node.id,
      name: node.name || type,
      role: /logo|wordmark|brand/i.test(node.name || "") ? "logo" : "icon",
      w,
      h,
      scaleMode: "contain",
      parentId,
    });
    acc.exportIds.push(node.id);
  }

  if (type === "TEXT") {
    if (node.style?.fontFamily) {
      const weight = node.style.fontWeight ? ` ${node.style.fontWeight}` : "";
      const size = node.style.fontSize ? ` ${Math.round(node.style.fontSize)}px` : "";
      const lh = node.style.lineHeightPx
        ? `/${Math.round(node.style.lineHeightPx)}`
        : "";
      acc.fonts.push(`${node.style.fontFamily}${weight}${size}${lh}`);
    }
    if (node.characters?.trim()) {
      acc.texts.push(node.characters.replace(/\s+/g, " ").trim().slice(0, 400));
    }
  }

  if (acc.layers.length < 80) {
    const fill = solidFill(node);
    const textColor = type === "TEXT" ? fill : undefined;
    const bg = type !== "TEXT" ? fill : undefined;
    const copy =
      type === "TEXT" && node.characters
        ? ` “${node.characters.replace(/\s+/g, " ").trim().slice(0, 80)}”`
        : "";
    const typeBits =
      type === "TEXT" && node.style
        ? [
            node.style.fontFamily,
            node.style.fontWeight,
            node.style.fontSize != null
              ? `${Math.round(node.style.fontSize)}px`
              : "",
            node.style.lineHeightPx != null
              ? `lh ${Math.round(node.style.lineHeightPx)}px`
              : "",
            node.style.letterSpacing
              ? `track ${Math.round(node.style.letterSpacing * 10) / 10}`
              : "",
            node.style.textAlignHorizontal
              ? `align ${node.style.textAlignHorizontal}`
              : "",
            textColor,
          ]
            .filter(Boolean)
            .join(" ")
        : "";
    const lay = layoutHint(node);
    const imgBit = img
      ? ` IMAGE-${assetRole(node, w, h)} ${img.scaleMode === "FIT" ? "contain" : "cover"}`
      : "";
    acc.layers.push(
      `${"  ".repeat(Math.min(depth, 10))}- ${node.name || type} [${type}] @${x},${y} ${w}×${h}${bg ? ` bg ${bg}` : ""}${imgBit}${typeBits ? ` ${typeBits}` : ""}${lay ? ` ${lay}` : ""}${copy}`,
    );
  }

  for (const child of node.children || []) {
    walk(child, acc, depth + 1, thisBox, rootId, navBar, node.id);
  }
}

async function fileImageMap(
  fileKey: string,
  accessToken: string,
): Promise<Map<string, string>> {
  try {
    const data = await figmaGet<{ images?: Record<string, string | null> }>(
      `/files/${fileKey}/images`,
      accessToken,
    );
    return new Map(
      Object.entries(data.images || {}).filter(
        (row): row is [string, string] => Boolean(row[1]),
      ),
    );
  } catch (err) {
    console.warn("[figma] file images map failed", err);
    return new Map();
  }
}

function preferRawImage(need: AssetNeed): boolean {
  if (!need.imageRef) return false;
  if (need.hasSolid) return true;
  if (need.role === "icon" || need.role === "logo") return true;
  if (need.scaleMode === "contain") return true;
  return need.w <= 280 && need.h <= 280;
}

async function exportPngs(
  fileKey: string,
  ids: string[],
  accessToken: string,
  scale = 2,
): Promise<Array<{ id: string; url: string }>> {
  if (!ids.length) return [];
  const out: Array<{ id: string; url: string }> = [];
  for (let i = 0; i < ids.length; i += 12) {
    const chunk = ids.slice(i, i + 12);
    const qs = encodeURIComponent(chunk.join(","));
    const data = await figmaGet<{ images?: Record<string, string | null> }>(
      `/images/${fileKey}?ids=${qs}&format=png&scale=${scale}`,
      accessToken,
    );
    for (const [id, url] of Object.entries(data.images || {})) {
      if (url) out.push({ id, url });
    }
  }
  return out;
}

async function urlToShot(url: string, label: string): Promise<FigmaShot | null> {
  try {
    const res = await undiciFetch(url, {
      method: "GET",
      dispatcher: figmaDownloadAgent,
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      console.warn(`[figma] shot download ${res.status} ${label}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength < 80) {
      console.warn(`[figma] shot too small ${buf.byteLength}b ${label}`);
      return null;
    }
    const mime =
      res.headers.get("content-type")?.split(";")[0] || "image/png";
    return {
      mimeType: mime.startsWith("image/") ? mime : "image/png",
      base64: buf.toString("base64"),
      label,
    };
  } catch (err) {
    console.warn("[figma] shot failed", label, err);
    return null;
  }
}

async function persistAsset(
  buf: Buffer,
  mimeType: string,
  name: string,
): Promise<string | null> {
  try {
    const { saveAttachment } = await import("./attachments");
    const saved = await saveAttachment({
      name,
      mimeType: mimeType.startsWith("image/") ? mimeType : "image/png",
      size: buf.byteLength,
      buffer: buf,
      keepOriginal: true,
    });
    return saved.url;
  } catch (err) {
    console.warn("[figma] persist asset failed", name, err);
    return null;
  }
}

async function downloadAndPersist(
  url: string,
  name: string,
): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const shot = await urlToShot(url, name);
    if (!shot) continue;
    const buf = Buffer.from(shot.base64, "base64");
    const urlOut = await persistAsset(buf, shot.mimeType, name);
    if (urlOut) return urlOut;
  }
  return null;
}

async function inspectViaApi(
  ref: FigmaRef,
  accessToken: string,
  existingHome = false,
): Promise<FigmaInspect> {
  const acc: WalkAcc = {
    frames: [],
    colors: [],
    fonts: [],
    texts: [],
    imageRefs: [],
    exportIds: [],
    layers: [],
    assets: [],
    navItems: [],
    ctas: [],
  };

  let title = ref.fileName;
  let root: FigmaNode | undefined;
  let thumbnailUrl: string | undefined;

  if (ref.nodeId) {
    const data = await figmaGet<{
      name?: string;
      nodes?: Record<string, { document?: FigmaNode }>;
    }>(
      `/files/${ref.fileKey}/nodes?ids=${encodeURIComponent(ref.nodeId)}`,
      accessToken,
    );
    title = data.name || title;
    const nodes = data.nodes || {};
    root =
      nodes[ref.nodeId]?.document ||
      nodes[ref.nodeId.replace(/:/g, "-")]?.document ||
      nodes[ref.nodeId.replace(/-/g, ":")]?.document ||
      Object.values(nodes)[0]?.document;
  } else {
    const data = await figmaGet<{
      name?: string;
      document?: FigmaNode;
      thumbnailUrl?: string;
    }>(`/files/${ref.fileKey}?depth=2`, accessToken);
    title = data.name || title;
    thumbnailUrl = data.thumbnailUrl;
    const pages = data.document?.children || [];
    const frames: FigmaNode[] = [];
    for (const page of pages) {
      for (const child of page.children || []) {
        if (
          child.type === "FRAME" ||
          child.type === "COMPONENT" ||
          child.type === "SECTION"
        ) {
          frames.push(child);
        }
      }
    }
    const target = [...frames].sort((a, b) => {
      const aa = (a.absoluteBoundingBox?.width || 0) * (a.absoluteBoundingBox?.height || 0);
      const bb = (b.absoluteBoundingBox?.width || 0) * (b.absoluteBoundingBox?.height || 0);
      return bb - aa;
    })[0];
    if (target?.id) {
      const full = await figmaGet<{
        nodes?: Record<string, { document?: FigmaNode }>;
      }>(
        `/files/${ref.fileKey}/nodes?ids=${encodeURIComponent(target.id)}`,
        accessToken,
      );
      root = full.nodes?.[target.id]?.document || target;
    } else {
      root = data.document;
    }
  }

  if (!root) {
    throw new Error("Figma node was empty — copy the frame link (node-id) from Figma.");
  }

  const targetId = root.id || ref.nodeId || "";
  const w = Math.round(root.absoluteBoundingBox?.width || 0);
  const h = Math.round(root.absoluteBoundingBox?.height || 0);
  walk(root, acc, 0, undefined, targetId);

  const picked = pickAssets(acc.assets.filter((a) => a.id !== targetId));
  const largeIds = unique(
    picked.filter((a) => a.w * a.h >= 400_000).map((a) => a.id),
  );
  const smallIds = unique(
    picked.filter((a) => a.w * a.h < 400_000).map((a) => a.id),
  );
  const frameScale = h > 5000 ? 0.5 : h > 2500 ? 1 : 2;
  const [rawImages, frameExport, smallExport, largeExport] = await Promise.all([
    fileImageMap(ref.fileKey, accessToken),
    exportPngs(ref.fileKey, [targetId], accessToken, frameScale),
    exportPngs(ref.fileKey, smallIds, accessToken, 2),
    exportPngs(ref.fileKey, largeIds, accessToken, 1),
  ]);
  const exportById = new Map(
    [...smallExport, ...largeExport].map((e) => [e.id, e.url]),
  );

  const shots: FigmaShot[] = [];
  const mainFrame = frameExport[0];
  if (mainFrame) {
    const shot = await urlToShot(mainFrame.url, `Figma · ${root.name}`);
    if (shot) shots.push(shot);
  } else if (thumbnailUrl) {
    const shot = await urlToShot(thumbnailUrl, "Figma thumbnail");
    if (shot) shots.push(shot);
  }

  // Use Figma export URLs in the page. Re-downloading every PNG through Node
  // hits S3 connect timeouts and wedges the Next server for minutes.
  const placed: Array<AssetNeed & { url: string }> = picked
    .map((need) => {
      const raw =
        (preferRawImage(need) && need.imageRef
          ? rawImages.get(need.imageRef)
          : undefined) || exportById.get(need.id);
      return raw ? { ...need, url: raw } : null;
    })
    .filter((row): row is AssetNeed & { url: string } => Boolean(row));

  const colors = unique(acc.colors).slice(0, 16);
  const fonts = unique(acc.fonts).slice(0, 14);
  const copy = unique(acc.texts).slice(0, 40);
  const fontFamilies = unique(
    fonts
      .map((f) => f.replace(/\s+\d.*$/, "").trim())
      .map((f) => f.replace(/\s+\d+$/, "").trim()),
  );
  const googleImports = unique(
    fontFamilies.map((f) => googleFontImport(f)).filter((x): x is string => Boolean(x)),
  );
  const imageUrls = unique(placed.map((p) => p.url));
  const requiredTokens = imageUrls
    .map((u) => {
      const id = u.split("/").filter(Boolean).pop();
      return id && id.length >= 6 ? id : u.slice(-20);
    })
    .filter(Boolean)
    .slice(0, 20);

  const assetMap = new Map(
    placed.map((p) => [p.id, { url: p.url, fit: p.scaleMode }]),
  );
  const layout = buildLayoutTree(root, assetMap);
  const frameKind = classifyFigmaFrame(layout, root.name || title, existingHome);
  const frameRoute = routeForKind(frameKind, root.name || title);
  const canvas = formatCanvasSpec(layout, w, h);
  const skeletonFiles = buildSkeletonFiles(
    layout,
    w,
    colors,
    googleImports,
    frameKind,
  );
  console.info(
    `[figma] canvas ${w}×${h} kind=${frameKind} route=${frameRoute} sections=${layout.children.length} assets=${placed.length} skeleton=${skeletonFiles.reduce((n, f) => n + f.code.length, 0)}c`,
  );

  const assetLines = placed.map((p) => {
    const how =
      p.role === "bg"
        ? `CSS background-image:url(...) background-size:${p.scaleMode} on layer "${p.name}" — not a random <img>`
        : p.role === "icon" || p.role === "logo"
          ? `<img src> ${p.w}×${p.h} object-contain on layer "${p.name}"`
          : `<img src> ${p.w}×${p.h} object-${p.scaleMode} on layer "${p.name}"`;
    return `- ${p.role.toUpperCase()} "${p.name}" ${p.w}×${p.h} → ${p.url}\n  ${how}`;
  });

  const brief = [
    `# FIGMA BUILD BRIEF`,
    `FIGMA_BUILD: 1`,
    `FIGMA_KIND: ${frameKind}`,
    `FIGMA_ROUTE: ${frameRoute}`,
    existingHome && frameKind !== "home" ? `FIGMA_PAGE: 1` : "",
    `FIGMA_PROJECT: ${slugName(root.name || title)}`,
    `Source: ${ref.url}`,
    `File: ${title}`,
    `Frame: ${root.name} (${w}×${h})`,
    `Node: ${targetId || "(file)"}`,
    requiredTokens.length
      ? `CLONE_REQUIRED_TOKENS: ${requiredTokens.join("|")}`
      : "",
    "",
    `## HARD RULES — pixel match, not a redesign`,
    `The attached FRAME SCREENSHOT is vision-only. Do NOT put that screenshot in the page as an <img> or background.`,
    `Implement the LAYER TREE. @x,y is offset from the parent. Sizes are px.`,
    `Auto-layout (flex-row / flex-col): use flex + the listed gap/pad. absolute-children: position:absolute; left/top from @x,y.`,
    `NAV and BUTTONS sections are exact labels. Do not rename Home→Podcast, Watch Video→Work With Me, or invent links.`,
    `LOGO asset = visible <img>, never a hand-lettered SVG and never hidden in sr-only.`,
    `One ASSET URL → one place. Do not reuse a hero photo as a YouTube thumb. Do not duplicate a testimonial.`,
    `No chrome the tree does not list: sticky/blur header, extra borders, gradient overlays, card boxes around cutouts, cyan rules, Lucide stand-ins.`,
    `Cutout / no-fill photos sit on the page background. Arch / pill / circle shapes come from the listed radius — not rounded-xl on everything.`,
    existingHome && frameKind !== "home"
      ? `This frame is an ADDITIONAL page at ${frameRoute}. Do NOT replace app/page.tsx or the existing home canvas.`
      : `This frame compiles to ${frameRoute}. Do not invent extra shop/about pages.`,
    `Product cards on home open /product/[slug] from lib/catalog.ts. Do not invent SKUs.`,
    `Desktop at the frame width. Under 960px stack [data-section] bands — do not shrink the whole artboard.`,
    `Do not call write_image / Pexels. Do not invent sections. §5 store invention is OFF.`,
    `DESKTOP CANVAS below is the layout. Keep those boxes. Do not rewrite widths or move IMGs.`,
    "",
    canvas,
    "",
    `## COLORS (use these hexes in globals.css — no new palette)`,
    colors.length ? colors.map((c) => `- ${c}`).join("\n") : "- (read from screenshot)",
    "",
    `## TYPE`,
    fonts.length ? fonts.map((f) => `- ${f}`).join("\n") : "- (read from screenshot)",
    googleImports.length
      ? `next/font/google: ${googleImports.join(", ")}`
      : `next/font: use the family names above with a serif/sans fallback — do not substitute Inter/Geist unless listed.`,
    "",
    `## COPY (exact — do not rewrite)`,
    ...(copy.length ? copy.map((t) => `- ${t}`) : ["- (read from screenshot)"]),
    "",
    `## NAV (exact — do not rename)`,
    ...(unique(acc.navItems).length
      ? unique(acc.navItems).map((t) => `- ${t}`)
      : ["- (read from screenshot header)"]),
    "",
    `## BUTTONS (exact label · size · fill)`,
    ...(unique(acc.ctas).length
      ? unique(acc.ctas).map((t) => `- ${t}`)
      : ["- (read from screenshot)"]),
    "",
    `## LAYER TREE (@x,y from parent · build this structure)`,
    ...(acc.layers.length ? acc.layers : ["- (use screenshot)"]),
    "",
    `## ASSETS (one URL ↔ one layer — do not reuse blindly)`,
    ...(assetLines.length
      ? assetLines
      : ["- (none — CSS/SVG only; never stock photos)"]),
  ]
    .filter((line) => line !== "")
    .join("\n");

  return {
    ref,
    title,
    brief,
    shots,
    imageUrls,
    requiredTokens,
    skeletonFiles,
    frameKind,
    frameRoute,
  };
}

function planRequiredBrief(ref: FigmaRef): FigmaInspect {
  return {
    ref,
    title: ref.fileName,
    brief: [
      `# FIGMA BLOCKED`,
      `FIGMA_PLAN_REQUIRED: 1`,
      `Source: ${ref.url}`,
      `STOP. Do not call set_project, write_file, or write_image. Do not invent a store or landing page.`,
      `Call message_user once: Figma import is on Plus and Pro. Upgrade to continue. Then finish.`,
    ].join("\n"),
    shots: [],
    imageUrls: [],
    requiredTokens: [],
  };
}

function needsConnectBrief(ref: FigmaRef): FigmaInspect {
  return {
    ref,
    title: ref.fileName,
    brief: [
      `# FIGMA BLOCKED`,
      `FIGMA_NEEDS_CONNECT: 1`,
      `Source: ${ref.url}`,
      `STOP. Do not call set_project, write_file, or write_image. Do not invent a store or landing page.`,
      `Call message_user once: connect Figma from the account menu, then send the frame link again. Then finish.`,
    ].join("\n"),
    shots: [],
    imageUrls: [],
    requiredTokens: [],
  };
}

function accessDeniedBrief(
  ref: FigmaRef,
  err: string,
  title = ref.fileName,
  handle?: string,
): FigmaInspect {
  const who = handle ? `@${handle}` : "the Figma account connected to Luca";
  return {
    ref,
    title,
    brief: [
      `# FIGMA BLOCKED`,
      `FIGMA_ACCESS_DENIED: 1`,
      `Source: ${ref.url}`,
      `File: ${title}`,
      `Error: ${err.slice(0, 220)}`,
      `STOP. Do not call set_project, write_file, or write_image. Do not invent a store from a thumbnail.`,
      `Figma allowed the token but denied this file. Open the file while logged in as ${who}. Share → invite ${who} as Viewer (link-only share is not enough). If the OAuth app is Private, this file must live on that same Figma team. Then send the frame link again.`,
    ].join("\n"),
    shots: [],
    imageUrls: [],
    requiredTokens: [],
  };
}

function tokenInvalidBrief(ref: FigmaRef, err: string): FigmaInspect {
  return {
    ref,
    title: ref.fileName,
    brief: [
      `# FIGMA BLOCKED`,
      `FIGMA_TOKEN_INVALID: 1`,
      `Source: ${ref.url}`,
      `Error: ${err.slice(0, 220)}`,
      `STOP. Do not call set_project, write_file, or write_image. Do not invent a site.`,
      `The connected Figma token was rejected. Disconnect Figma in the account menu, then Connect Figma again. The Figma OAuth app must be Published (Private is fine) — Draft apps issue tokens that the API rejects.`,
    ].join("\n"),
    shots: [],
    imageUrls: [],
    requiredTokens: [],
  };
}

export async function inspectFigma(
  url: string,
  accessToken?: string | null,
  opts?: {
    refreshAccessToken?: () => Promise<string | null>;
    figmaHandle?: string;
    existingHome?: boolean;
    planAllowed?: boolean;
    onSuccessfulInspect?: () => Promise<void>;
  },
): Promise<FigmaInspect | null> {
  const ref = parseFigmaUrl(url);
  if (!ref) return null;
  console.info(
    `[figma] inspect ${ref.fileKey} node=${ref.nodeId || "file"} token=${Boolean(accessToken)}`,
  );

  if (opts?.planAllowed === false) {
    return planRequiredBrief(ref);
  }

  if (!accessToken) {
    return needsConnectBrief(ref);
  }

  const run = async (token: string) => {
    const result = await inspectViaApi(ref, token, Boolean(opts?.existingHome));
    console.info(
      `[figma] api ok shots=${result.shots.length} assets=${result.imageUrls.length} layers=${result.brief.includes("LAYER TREE")}`,
    );
    if (opts?.onSuccessfulInspect) await opts.onSuccessfulInspect();
    return result;
  };

  try {
    return await run(accessToken);
  } catch (err) {
    if (isInvalidTokenError(err) && opts?.refreshAccessToken) {
      const next = await opts.refreshAccessToken();
      if (next) {
        try {
          return await run(next);
        } catch (retryErr) {
          const msg =
            retryErr instanceof Error ? retryErr.message : "Figma API failed";
          console.warn("[figma] still invalid after refresh", msg);
          return tokenInvalidBrief(ref, msg);
        }
      }
    }
    const msg = err instanceof Error ? err.message : "Figma API failed";
    console.warn("[figma] api failed — will not invent from thumbnail", msg);
    if (isInvalidTokenError(err)) return tokenInvalidBrief(ref, msg);
    return accessDeniedBrief(ref, msg, ref.fileName, opts?.figmaHandle);
  }
}

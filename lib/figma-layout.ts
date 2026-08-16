import type { ProjectFile } from "./types";
import {
  buildCatalogFile,
  buildDynamicProductPage,
  buildProductChromeFiles,
  buildThinHomeRedirect,
  extractCatalog,
  extractJournal,
} from "./figma-app";
import {
  extractPrimaryProduct,
  markProductBinds,
  routeForKind,
  type FigmaFrameKind,
} from "./figma-frame";
import {
  annotateLife,
  hrefFromReactions,
  SITE_LIFE_CSS,
  SITE_LIFE_TSX,
  type LifeRole,
} from "./figma-life";
import {
  fontNeedsWeight,
  fontStack,
  fontVarName,
  resolveGoogleFont,
} from "./figma-fonts";

export type LayoutNode = {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  absoluteBoundingBox?: { x?: number; y?: number; width: number; height: number };
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL";
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  cornerRadius?: number;
  opacity?: number;
  strokeWeight?: number;
  strokes?: Array<{ type?: string; visible?: boolean; color?: { r: number; g: number; b: number; a?: number } }>;
  fills?: Array<{
    type?: string;
    visible?: boolean;
    color?: { r: number; g: number; b: number; a?: number };
    imageRef?: string;
    scaleMode?: string;
    gradientHandlePositions?: Array<{ x: number; y: number }>;
    gradientStops?: Array<{
      color: { r: number; g: number; b: number; a?: number };
      position: number;
    }>;
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
  children?: LayoutNode[];
  transitionNodeID?: string;
  reactions?: Array<{
    actions?: Array<{ type?: string; url?: string; destinationId?: string }>;
    action?: { type?: string; url?: string; destinationId?: string };
  }>;
};

export type LayoutBox = {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  bg?: string;
  radius?: number;
  layout: "flex-row" | "flex-col" | "abs";
  gap?: number;
  pad?: string;
  text?: string;
  font?: string;
  color?: string;
  assetUrl?: string;
  assetFit?: string;
  fontFamily?: string;
  fontWeight?: number;
  align?: "left" | "center" | "right" | "justify";
  valign?: "top" | "middle" | "bottom";
  tracking?: number;
  opacity?: number;
  border?: string;
  overlay?: string;
  icon?: boolean;
  role?: LifeRole;
  href?: string;
  placeholder?: string;
  inputType?: "search" | "email" | "text";
  sectionId?: string;
  reveal?: boolean;
  bind?: "name" | "price" | "image";
  bindIndex?: number;
  children: LayoutBox[];
};

function uniqueFonts(names: string[]): string[] {
  const out: string[] = [];
  for (const name of names) {
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

function hex(c: { r: number; g: number; b: number }): string {
  const h = (n: number) =>
    Math.round(Math.min(1, Math.max(0, n)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

function cssColor(c: { r: number; g: number; b: number; a?: number }): string {
  const a = c.a ?? 1;
  if (a >= 0.995) return hex(c);
  const r = Math.round(Math.min(1, Math.max(0, c.r)) * 255);
  const g = Math.round(Math.min(1, Math.max(0, c.g)) * 255);
  const b = Math.round(Math.min(1, Math.max(0, c.b)) * 255);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
}

function solid(node: LayoutNode): string | undefined {
  for (const fill of node.fills || []) {
    if (fill.visible === false) continue;
    if (fill.type === "SOLID" && fill.color) {
      if ((fill.color.a ?? 1) < 0.02) continue;
      return cssColor(fill.color);
    }
  }
  return undefined;
}

function gradientCss(
  fill: NonNullable<LayoutNode["fills"]>[number],
): string | undefined {
  if (!fill.type?.startsWith("GRADIENT") || !fill.gradientStops?.length) {
    return undefined;
  }
  const stops = [...fill.gradientStops]
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .map((stop) => `${cssColor(stop.color)} ${((stop.position || 0) * 100).toFixed(1)}%`)
    .join(", ");
  const start = fill.gradientHandlePositions?.[0] || { x: 0, y: 0.5 };
  const end = fill.gradientHandlePositions?.[1] || { x: 1, y: 0.5 };
  const angle =
    (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI + 90;
  if (fill.type === "GRADIENT_RADIAL") {
    return `radial-gradient(circle at ${(start.x * 100).toFixed(1)}% ${(start.y * 100).toFixed(1)}%, ${stops})`;
  }
  return `linear-gradient(${angle.toFixed(1)}deg, ${stops})`;
}

function firstGradient(node: LayoutNode): string | undefined {
  for (const fill of node.fills || []) {
    if (fill.visible === false) continue;
    const css = gradientCss(fill);
    if (css) return css;
  }
  return undefined;
}

function overlayFill(node: LayoutNode): string | undefined {
  const fills = node.fills || [];
  const hasImg = fills.some((fill) => fill.visible !== false && fill.type === "IMAGE");
  const gradient = firstGradient(node);
  if (hasImg && gradient) return gradient;
  if (!hasImg) return undefined;
  for (const fill of fills) {
    if (fill.visible === false || fill.type !== "SOLID" || !fill.color) continue;
    const a = fill.color.a ?? 1;
    if (a > 0.04 && a < 0.96) return cssColor(fill.color);
  }
  return undefined;
}

function strokeBorder(node: LayoutNode): string | undefined {
  if (!node.strokeWeight || node.strokeWeight < 0.4) return undefined;
  const stroke = (node.strokes || []).find(
    (s) => s.visible !== false && s.color,
  );
  if (!stroke?.color) return undefined;
  return `${Math.max(1, Math.round(node.strokeWeight))}px solid ${cssColor(stroke.color)}`;
}

function textAlign(value?: string): LayoutBox["align"] {
  const v = (value || "").toUpperCase();
  if (v === "CENTER") return "center";
  if (v === "RIGHT") return "right";
  if (v === "JUSTIFIED") return "justify";
  return "left";
}

function textValign(value?: string): LayoutBox["valign"] {
  const v = (value || "").toUpperCase();
  if (v === "CENTER") return "middle";
  if (v === "BOTTOM") return "bottom";
  return "top";
}

function hasImageFill(node: LayoutNode): boolean {
  return (node.fills || []).some(
    (fill) => fill.visible !== false && fill.type === "IMAGE",
  );
}

function luminance(hexColor: string): number {
  const m = hexColor.match(/^#([0-9a-f]{6})$/i);
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function pageBackground(root: LayoutBox, colors: string[]): string {
  if (root.bg) return root.bg;
  const light = colors.find((c) => luminance(c) > 0.72);
  return light || "#ffffff";
}

function shouldPaintBorder(node: LayoutNode, icon: boolean, hasAsset: boolean): boolean {
  if (icon || hasAsset || node.type === "TEXT") return false;
  if (
    node.type === "GROUP" ||
    node.type === "VECTOR" ||
    node.type === "BOOLEAN_OPERATION" ||
    node.type === "LINE"
  ) {
    return false;
  }
  if (!strokeBorder(node)) return false;
  const kids = node.children?.length || 0;
  if (
    (node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE") &&
    kids > 8
  ) {
    return false;
  }
  return true;
}

function keepChild(node: LayoutNode, hasAsset: boolean): boolean {
  if (node.visible === false) return false;
  if (node.type === "TEXT" && node.characters?.trim()) return true;
  if (hasAsset || hasImageFill(node)) return true;
  const box = node.absoluteBoundingBox;
  const w = box?.width || 0;
  const h = box?.height || 0;
  if (solid(node) && w >= 4 && h >= 4) return true;
  if (firstGradient(node) && w >= 4 && h >= 4) return true;
  if (w >= 8 && h >= 8) return true;
  return Boolean(node.children?.length);
}

function isPriorityChild(node: LayoutNode, hasAsset: boolean): boolean {
  if (node.type === "TEXT" && node.characters?.trim()) return true;
  if (hasAsset || hasImageFill(node)) return true;
  return Boolean(solid(node));
}

function selectChildren(node: LayoutNode, assets: Map<string, { url: string; fit: string }>, cap: number): LayoutNode[] {
  const raw = (node.children || []).filter((child) =>
    keepChild(child, assets.has(child.id) || hasImageFill(child)),
  );
  if (raw.length <= cap) return raw;
  const must = raw.filter((child) => isPriorityChild(child, assets.has(child.id)));
  const rest = raw.filter((child) => !isPriorityChild(child, assets.has(child.id)));
  const picked = new Set([...must, ...rest].slice(0, cap));
  return raw.filter((child) => picked.has(child));
}

function cleanText(value: string): string {
  return value.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function hasJapanese(box: LayoutBox): boolean {
  if (box.text && /[\u3040-\u30ff\u4e00-\u9fff]/.test(box.text)) return true;
  return box.children.some(hasJapanese);
}

function hasText(box: LayoutBox): boolean {
  if (box.text) return true;
  return box.children.some(hasText);
}

function fontSizeExpr(px: number, frameW: number): string {
  return `${((px / frameW) * 100).toFixed(4)}cqw`;
}

function assetFitFor(box: LayoutBox): string {
  if (box.w >= 900 || box.h >= 500) return "cover";
  if (box.assetFit) return box.assetFit;
  if (box.w <= 280 && box.h <= 280) return "contain";
  return "cover";
}

function toBox(
  node: LayoutNode,
  parent: { x: number; y: number },
  assets: Map<string, { url: string; fit: string }>,
  depth: number,
  maxDepth: number,
): LayoutBox {
  const box = node.absoluteBoundingBox;
  const w = Math.round(box?.width || 0);
  const h = Math.round(box?.height || 0);
  const x = Math.round((box?.x || 0) - parent.x);
  const y = Math.round((box?.y || 0) - parent.y);
  const asset = assets.get(node.id);
  const fill = solid(node);
  const layout: LayoutBox["layout"] =
    node.layoutMode === "HORIZONTAL"
      ? "flex-row"
      : node.layoutMode === "VERTICAL"
        ? "flex-col"
        : "abs";
  const pad = [
    node.paddingTop,
    node.paddingRight,
    node.paddingBottom,
    node.paddingLeft,
  ];
  const childParent = { x: box?.x || 0, y: box?.y || 0 };
  const childCap = depth === 0 ? 180 : 120;
  const rawChildren =
    depth < maxDepth
      ? selectChildren(node, assets, childCap).map((child) =>
          toBox(child, childParent, assets, depth + 1, maxDepth),
        )
      : [];
  const gradient = firstGradient(node);
  const overlay = overlayFill(node);
  const icon = Boolean(
    asset && w <= 220 && h <= 220 && (asset.fit === "contain" || w <= 200),
  );
  const children =
    asset && !rawChildren.some((child) => hasText(child) && (child.text || "").length > 2)
      ? []
      : rawChildren;
  const cardFill =
    fill &&
    !fill.startsWith("rgba") &&
    !fill.includes("gradient") &&
    luminance(fill) > 0.55
      ? fill
      : undefined;
  return {
    id: node.id,
    name: (node.name || node.type).slice(0, 48),
    x,
    y,
    w,
    h,
    bg:
      node.type === "TEXT" || icon
        ? undefined
        : hasImageFill(node) || asset
          ? cardFill
          : fill || gradient,
    radius: node.cornerRadius ? Math.round(node.cornerRadius) : undefined,
    layout,
    gap: node.itemSpacing != null ? Math.round(node.itemSpacing) : undefined,
    pad: pad.some((n) => n != null && n > 0)
      ? `${Math.round(pad[0] || 0)}/${Math.round(pad[1] || 0)}/${Math.round(pad[2] || 0)}/${Math.round(pad[3] || 0)}`
      : undefined,
    text:
      node.type === "TEXT" && node.characters
        ? cleanText(node.characters).slice(0, 500)
        : undefined,
    font: node.style
      ? [
          node.style.fontFamily,
          node.style.fontWeight,
          node.style.fontSize != null ? `${Math.round(node.style.fontSize)}px` : "",
          node.style.lineHeightPx != null
            ? `/${Math.round(node.style.lineHeightPx)}`
            : "",
        ]
          .filter(Boolean)
          .join(" ")
      : undefined,
    color: node.type === "TEXT" ? fill : undefined,
    fontFamily: node.style?.fontFamily,
    fontWeight: node.style?.fontWeight,
    align: node.type === "TEXT" ? textAlign(node.style?.textAlignHorizontal) : undefined,
    valign: node.type === "TEXT" ? textValign(node.style?.textAlignVertical) : undefined,
    tracking: node.style?.letterSpacing,
    opacity: node.opacity != null && node.opacity < 0.995 ? node.opacity : undefined,
    border: shouldPaintBorder(node, icon, Boolean(asset))
      ? strokeBorder(node)
      : undefined,
    overlay,
    icon,
    assetUrl: asset?.url,
    assetFit: asset?.fit,
    href: hrefFromReactions(node),
    children,
  };
}

function inferPhotoFades(parent: LayoutBox): void {
  const photos = parent.children.filter(
    (child) => child.assetUrl && !child.icon && child.w >= 360,
  );
  const texts = parent.children.filter((child) => hasText(child));
  for (const photo of photos) {
    if (photo.overlay) continue;
    if (photo.w >= parent.w * 0.85 && photo.x <= 12) continue;
    const overlaps = texts.some((text) => {
      const overlapX =
        Math.min(text.x + text.w, photo.x + photo.w) - Math.max(text.x, photo.x);
      const overlapY =
        Math.min(text.y + text.h, photo.y + photo.h) - Math.max(text.y, photo.y);
      return overlapX > 80 && overlapY > 40 && text.x < photo.x + photo.w * 0.45;
    });
    if (overlaps) {
      photo.overlay =
        "linear-gradient(90deg, #ffffff 0%, rgba(255,255,255,0.94) 26%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0) 70%)";
    }
  }
  for (const child of parent.children) inferPhotoFades(child);
}

export function buildLayoutTree(
  root: LayoutNode,
  assets: Map<string, { url: string; fit: string }>,
): LayoutBox {
  const origin = {
    x: root.absoluteBoundingBox?.x || 0,
    y: root.absoluteBoundingBox?.y || 0,
  };
  const tree = toBox(root, origin, assets, 0, 10);
  annotateLife(tree);
  inferPhotoFades(tree);
  return tree;
}

function lineFor(box: LayoutBox, indent: string): string {
  const bits = [
    `${indent}- ${box.name} @${box.x},${box.y} ${box.w}×${box.h}`,
    box.layout !== "abs" ? box.layout : "",
    box.gap != null ? `gap ${box.gap}` : "",
    box.pad ? `pad ${box.pad}` : "",
    box.bg ? `bg ${box.bg}` : "",
    box.overlay ? `overlay ${box.overlay}` : "",
    box.border ? `border ${box.border}` : "",
    box.radius ? `r${box.radius}` : "",
    box.align && box.align !== "left" ? `align ${box.align}` : "",
    box.assetUrl ? `IMG ${box.assetFit || "cover"} ${box.assetUrl}` : "",
    box.role ? box.role : "",
    box.href ? box.href : "",
    box.text ? `“${box.text}” ${box.font || ""} ${box.color || ""}` : "",
  ].filter(Boolean);
  return bits.join(" · ");
}

export function formatCanvasSpec(root: LayoutBox, frameW: number, frameH: number): string {
  const lines = [
    `## DESKTOP CANVAS ${frameW}×${frameH}`,
    `FIGMA_CANVAS: 1`,
    `Wrapper: width:100%; max-width:${frameW}px; aspect-ratio:${frameW}/${frameH} on desktop.`,
    `Every box: left/top/width/height as % of parent, max-width/max-height = Figma px.`,
    `Under 960px, #top stacks [data-section] bands — do not shrink the whole artboard.`,
    `Use the IMG urls on those layers. Do not invent photos or a card grid.`,
    "",
  ];
  const walkLines = (box: LayoutBox, indent: string, depth: number) => {
    lines.push(lineFor(box, indent));
    if (depth >= 8) return;
    for (const child of box.children) {
      walkLines(child, `${indent}  `, depth + 1);
    }
  };
  walkLines(root, "", 0);
  return lines.join("\n");
}

function pct(n: number, den: number): string {
  return `${((n / Math.max(den, 1)) * 100).toFixed(4)}%`;
}

function slotPos(
  box: LayoutBox,
  parentW: number,
  parentH: number,
  band = false,
): string {
  return [
    `position:"absolute"`,
    `left:${JSON.stringify(pct(box.x, parentW))}`,
    `top:${JSON.stringify(pct(box.y, parentH))}`,
    `width:${JSON.stringify(pct(box.w, parentW))}`,
    `height:${JSON.stringify(pct(box.h, parentH))}`,
    `maxWidth:${Math.max(box.w, 1)}`,
    `maxHeight:${Math.max(box.h, 1)}`,
    `boxSizing:"border-box"`,
    band ? `"--band-w":${JSON.stringify(String(Math.max(box.w, 1)))}` : "",
    band ? `"--band-h":${JSON.stringify(String(Math.max(box.h, 1)))}` : "",
  ]
    .filter(Boolean)
    .join(",");
}

function isRowBand(box: LayoutBox): boolean {
  const kids = box.children.filter((child) => child.w >= 72 && child.h >= 72);
  if (kids.length < 2 || kids.length > 8) return false;
  if (box.layout === "flex-row") return true;
  const ys = kids.map((child) => child.y);
  const xs = kids.map((child) => child.x);
  const sameRow =
    Math.max(...ys) - Math.min(...ys) < Math.min(...kids.map((c) => c.h)) * 0.45;
  return sameRow && Math.max(...xs) - Math.min(...xs) > 80;
}

type RenderFlags = { rootChild?: boolean };

function lifeAttrs(box: LayoutBox, flags?: RenderFlags): string {
  const cls = box.role && box.role !== "section" && box.role !== "media"
    ? box.role === "nav"
      ? "luca-nav"
      : box.role === "cta"
        ? "luca-cta"
        : box.role === "link"
          ? "luca-link"
          : box.role === "card"
            ? "luca-card"
            : box.role === "logo"
              ? "luca-logo"
            : box.role === "input"
              ? "luca-field"
              : ""
    : "";
  const chrome = Boolean(flags?.rootChild && box.h < 160 && box.y < 80);
  const section = Boolean(
    flags?.rootChild && !chrome && (box.h >= 140 || box.role === "section"),
  );
  return [
    cls ? ` className=${JSON.stringify(cls)}` : "",
    box.sectionId ? ` id=${JSON.stringify(box.sectionId)}` : "",
    box.reveal ? ` data-reveal=""` : "",
    section ? ` data-section=""` : "",
    chrome ? ` data-chrome=""` : "",
    isRowBand(box) ? ` data-row=""` : "",
  ].join("");
}

function openTag(box: LayoutBox, linked: boolean, flags?: RenderFlags): string {
  if (linked && box.href) {
    return `<a href={${JSON.stringify(box.href)}}${lifeAttrs(box, flags)}`;
  }
  return `<div${lifeAttrs(box, flags)}`;
}

function closeTag(box: LayoutBox, linked: boolean): string {
  return linked && box.href ? "</a>" : "</div>";
}

function overlayLayer(box: LayoutBox): string {
  if (!box.overlay) return "";
  return `<div style={{position:"absolute",inset:0,background:${JSON.stringify(box.overlay)},pointerEvents:"none",zIndex:1${box.radius ? `,borderRadius:${box.radius}` : ""}}} />`;
}

function stackIndex(box: LayoutBox): number {
  if (
    box.text ||
    box.role === "nav" ||
    box.role === "cta" ||
    box.role === "link" ||
    box.role === "input"
  ) {
    return 4;
  }
  if (hasText(box) && !box.assetUrl) return 4;
  if (box.overlay || (box.bg && box.bg.includes("gradient"))) return 1;
  if (box.assetUrl || box.icon) return 0;
  return 2;
}

function boxChrome(box: LayoutBox, linked: boolean): string[] {
  const fade = Boolean(box.overlay || (box.bg && box.bg.includes("gradient")));
  return [
    `zIndex:${stackIndex(box)}`,
    box.opacity != null ? `opacity:${box.opacity}` : "",
    box.border ? `border:${JSON.stringify(box.border)}` : "",
    box.bg ? `background:${JSON.stringify(box.bg)}` : `background:"transparent"`,
    box.radius ? `borderRadius:${box.radius}` : "",
    fade && !linked ? `pointerEvents:"none"` : "",
  ];
}

function renderBox(
  box: LayoutBox,
  parentW: number,
  parentH: number,
  frameW: number,
  parentLinked = false,
  parentInput = false,
  flags?: RenderFlags,
): string {
  const pos = slotPos(box, parentW, parentH, Boolean(flags?.rootChild));
  const fontPx = Number(box.font?.match(/(\d+)px/)?.[1] || 0);
  const lhPx = Number(box.font?.match(/\/(\d+)/)?.[1] || 0);
  const linked = !parentLinked && Boolean(box.href) && box.role !== "input";
  if (parentInput && box.text) return "";
  if (box.role === "input") {
    const placeholder = box.placeholder || box.text || "Search";
    const type = box.inputType || "search";
    const ja = /[\u3040-\u30ff\u4e00-\u9fff]/.test(placeholder);
    const family = fontStack(box.fontFamily, ja);
    const field = [
      pos,
      `zIndex:4`,
      box.opacity != null ? `opacity:${box.opacity}` : "",
      box.border ? `border:${JSON.stringify(box.border)}` : "",
      box.bg ? `background:${JSON.stringify(box.bg)}` : `background:"transparent"`,
      box.radius ? `borderRadius:${box.radius}` : "",
      `overflow:"hidden"`,
    ]
      .filter(Boolean)
      .join(",");
    const icons = box.children
      .filter((child) => !child.text)
      .map((child) =>
        renderBox(child, Math.max(box.w, 1), Math.max(box.h, 1), frameW, true, true),
      )
      .join("\n        ");
    return `<form className="luca-field" style={{${field}}} onSubmit={(e) => e.preventDefault()}>${icons ? `\n        ${icons}\n        ` : ""}<input className="luca-input" name="q" type={${JSON.stringify(type)}} placeholder={${JSON.stringify(placeholder)}} style={{fontFamily:${JSON.stringify(family)},color:${JSON.stringify(box.color || "inherit")},fontSize:${JSON.stringify(fontPx ? fontSizeExpr(fontPx, frameW) : "inherit")}}} />
      </form>`;
  }
  if (box.text) {
    const ja = /[\u3040-\u30ff\u4e00-\u9fff]/.test(box.text);
    const family = fontStack(box.fontFamily, ja);
    const short = !box.text.includes("\n") && box.text.length <= 28;
    const style = [
      pos,
      `margin:0`,
      `display:"flex"`,
      `flexDirection:"column"`,
      `justifyContent:${JSON.stringify(box.valign === "middle" ? "center" : box.valign === "bottom" ? "flex-end" : "flex-start")}`,
      `alignItems:${JSON.stringify(short && box.align === "center" ? "center" : short && box.align === "right" ? "flex-end" : "stretch")}`,
      `textAlign:${JSON.stringify(box.align || "left")}`,
      `width:${JSON.stringify(pct(box.w, parentW))}`,
      `maxWidth:${Math.max(box.w, 1)}`,
      `overflow:"visible"`,
      short ? `whiteSpace:"nowrap"` : `whiteSpace:"pre-wrap"`,
      `zIndex:4`,
      box.opacity != null ? `opacity:${box.opacity}` : "",
      box.color ? `color:${JSON.stringify(box.color)}` : "",
      `fontFamily:${JSON.stringify(family)}`,
      fontPx ? `fontSize:${JSON.stringify(fontSizeExpr(fontPx, frameW))}` : "",
      lhPx ? `lineHeight:${JSON.stringify(fontSizeExpr(lhPx, frameW))}` : "",
      box.tracking
        ? `letterSpacing:${JSON.stringify(fontSizeExpr(box.tracking, frameW))}`
        : "",
      box.fontWeight
        ? `fontWeight:${box.fontWeight}`
        : / 7\d{2}| 8\d{2}| 9\d{2}/.test(box.font || "")
          ? `fontWeight:700`
          : / 6\d{2}/.test(box.font || "")
            ? `fontWeight:600`
            : "",
    ]
      .filter(Boolean)
      .join(",");
    const tag = linked ? "a" : "p";
    const href = linked ? ` href={${JSON.stringify(box.href)}}` : "";
    const textExpr =
      box.bind === "name"
        ? `{product.name}`
        : box.bind === "price"
          ? `{product.price || ${JSON.stringify(box.text)}}`
          : `{${JSON.stringify(box.text)}}`;
    return `<${tag}${href}${lifeAttrs(box, flags)} style={{${style}}}>${textExpr}</${tag}>`;
  }
  const fit = box.icon ? "contain" : assetFitFor(box);
  const imgSrc =
    box.bind === "image"
      ? `{product.images[${box.bindIndex || 0}] || product.image || ${JSON.stringify(box.assetUrl)}}`
      : `{${JSON.stringify(box.assetUrl)}}`;
  const fillImg = box.assetUrl
    ? `<img src=${imgSrc} alt={${JSON.stringify(box.name)}} style={{width:"100%",height:"100%",maxWidth:${Math.max(box.w, 1)},maxHeight:${Math.max(box.h, 1)},objectFit:${JSON.stringify(fit)},objectPosition:"center",display:"block",background:"transparent"${box.radius ? `,borderRadius:${box.radius}` : ""}}} />`
    : "";
  if (box.assetUrl && !box.children.length) {
    const leaf = [
      pos,
      ...boxChrome(box, linked),
      box.icon ? `overflow:"visible"` : `overflow:"hidden"`,
    ]
      .filter(Boolean)
      .join(",");
    return `${openTag(box, linked, flags)} style={{${leaf}}}>${fillImg}${overlayLayer(box)}${closeTag(box, linked)}`;
  }
  const kids = box.children
    .map((c) =>
      renderBox(
        c,
        Math.max(box.w, 1),
        Math.max(box.h, 1),
        frameW,
        linked || parentLinked,
        parentInput || box.role === "input",
      ),
    )
    .join("\n        ");
  const style = [
    pos,
    ...boxChrome(box, linked),
    box.assetUrl && !hasText(box) && !box.icon ? `overflow:"hidden"` : "",
  ]
    .filter(Boolean)
    .join(",");
  return `${openTag(box, linked, flags)} style={{${style}}}>${fillImg}${overlayLayer(box)}${kids ? `\n        ${kids}\n      ` : ""}${closeTag(box, linked)}`;
}

function pageComponentName(kind: FigmaFrameKind): string {
  switch (kind) {
    case "product":
      return "ProductPage";
    case "shop":
      return "ShopPage";
    case "about":
      return "AboutPage";
    case "journal":
      return "JournalPage";
    default:
      return "Home";
  }
}

export function buildSkeletonFiles(
  root: LayoutBox,
  frameW: number,
  colors: string[],
  googleFonts: string[],
  kind: FigmaFrameKind = "home",
): ProjectFile[] {
  const bg = pageBackground(root, colors);
  const textColor = (() => {
    let found: string | undefined;
    const walk = (box: LayoutBox) => {
      if (found) return;
      if (box.text && box.color) found = box.color;
      box.children.forEach(walk);
    };
    walk(root);
    return found;
  })();
  const fg =
    textColor ||
    colors.find((c) => c !== bg && luminance(c) < 0.35) ||
    "#111111";
  const bodyFamily = (() => {
    const counts = new Map<string, number>();
    const walk = (box: LayoutBox) => {
      if (box.fontFamily) {
        counts.set(box.fontFamily, (counts.get(box.fontFamily) || 0) + 1);
      }
      box.children.forEach(walk);
    };
    walk(root);
    let best = "";
    let n = 0;
    for (const [name, count] of counts) {
      if (count > n) {
        best = name;
        n = count;
      }
    }
    return fontStack(best || undefined, hasJapanese(root));
  })();
  if (kind === "product") markProductBinds(root);
  const products =
    kind === "product"
      ? [extractPrimaryProduct(root, root.name)].filter(
          (item): item is NonNullable<typeof item> => Boolean(item),
        )
      : extractCatalog(root);
  const posts = kind === "home" ? extractJournal(root, products) : [];
  const layers = root.children
    .map((child) =>
      renderBox(child, frameW, Math.max(root.h, 1), frameW, false, false, {
        rootChild: true,
      }),
    )
    .join("\n      ");

  const usedFonts: string[] = [];
  const walkFonts = (box: LayoutBox) => {
    if (box.fontFamily) {
      const resolved = resolveGoogleFont(box.fontFamily);
      if (resolved) usedFonts.push(resolved);
    }
    box.children.forEach(walkFonts);
  };
  walkFonts(root);
  const fontImports = uniqueFonts([...googleFonts, ...usedFonts]).slice(0, 6);
  const fontVars = fontImports.map((_, i) => `font${i}.variable`).join(" + \" \" + ");
  const layoutTsx = `import type { Metadata } from "next";
import type { ReactNode } from "react";
${fontImports.length ? `import { ${fontImports.join(", ")} } from "next/font/google";\n` : ""}import "./globals.css";
${fontImports
  .map((f, i) => {
    const weight = fontNeedsWeight(f)
      ? f === "Hina_Mincho"
        ? `, weight: ["400"]`
        : `, weight: ["400", "500", "600", "700"]`
      : "";
    return `const font${i} = ${f}({ subsets: ["latin"]${weight}, variable: "${fontVarName(f)}" });`;
  })
  .join("\n")}

export const metadata: Metadata = { title: "Site", description: "Figma frame" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" className={${fontImports.length ? fontVars : `""`}}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&family=Noto+Serif+JP:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
`;

  const pagePath = routeForKind(kind, root.name);
  const componentName = pageComponentName(kind);
  const productImports =
    kind === "product"
      ? `import { useParams } from "next/navigation";
import { getProduct } from "@/lib/catalog";
`
      : "";
  const productSetup =
    kind === "product"
      ? `  const params = useParams<{ slug: string }>();
  const product = getProduct(String(params.slug || "")) || { name: "", price: "", image: "", images: [] as string[] };
`
      : "";
  const page = `"use client";

import { useSiteLife } from "@/components/site-life";
${productImports}
export default function ${componentName}() {
  useSiteLife();
${productSetup}  return (
    <main className="min-h-screen" style={{ background: ${JSON.stringify(bg)}, color: ${JSON.stringify(fg)} }}>
      <div
        id="top"
        style={{
          width: "100%",
          maxWidth: ${frameW},
          margin: "0 auto",
          position: "relative",
          aspectRatio: "${frameW} / ${Math.max(root.h, 1)}",
          containerType: "inline-size",
        }}
      >
      ${layers}
      </div>
    </main>
  );
}
`;

  const css = `@import "tailwindcss";
@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&family=Noto+Serif+JP:wght@400;500;600;700&display=swap");

@layer base {
  :root {
    --background: ${bg};
    --foreground: ${fg};
${colors
  .slice(0, 8)
  .map((c, i) => `    --c${i}: ${c};`)
  .join("\n")}
  }
  body {
    background: var(--background);
    color: var(--foreground);
    margin: 0;
    font-family: ${bodyFamily};
  }
}
${SITE_LIFE_CSS}
`;

  const files: ProjectFile[] = [
    { path: "app/globals.css", code: css, language: "css" },
    { path: "app/layout.tsx", code: layoutTsx, language: "tsx" },
    { path: "components/site-life.tsx", code: SITE_LIFE_TSX, language: "tsx" },
    { path: pagePath, code: page, language: "tsx" },
  ];
  if (kind !== "home") {
    files.push(buildThinHomeRedirect());
  }
  if (products.length || posts.length) {
    files.push(buildCatalogFile(products, posts));
  }
  if (kind === "home" && products.length) {
    files.push(...buildProductChromeFiles(), buildDynamicProductPage(bg, fg));
  }
  if (kind === "product") {
    files.push(...buildProductChromeFiles());
    if (!products.length) {
      files.push(buildCatalogFile([], []));
    }
  }
  return files;
}

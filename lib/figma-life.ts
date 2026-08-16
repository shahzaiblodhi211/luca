import type { LayoutBox } from "./figma-layout";

export type LifeRole =
  | "nav"
  | "cta"
  | "link"
  | "card"
  | "section"
  | "logo"
  | "media"
  | "input";

const NAV_EXACT =
  /^(home|shop|about|journal|contact|blog|lookbook|collection|collections|story|stories|カート|ホーム|ショップ|ジャーナル|アバウト)$/i;
const CTA_EXACT =
  /^(shop now|buy now|read more|view all|view more|learn more|see more|get started|explore|sign in|log in|login|sign up|subscribe|submit|send|checkout|add to cart|商品を見る|ブランドストーリー|ブランドストーリーへ|詳しく見る|もっと見る|すべて見る|購入する|検索する)$/i;
const LINK_EXACT =
  /^(view all|view more|read more|shopping guide|privacy policy|privacy|terms|instagram|twitter|facebook|youtube|tiktok|詳しく見る|もっと見る|すべて見る)$/i;
const LOGO_RE = /logo|wordmark|brand mark|vent calme/i;
const INPUT_NAME_RE = /search|placeholder|query|検索|キーワード|^input$|text field|search field/i;
const INPUT_PLACEHOLDER_RE =
  /^(search|search…|search\.\.\.|email|your email|enter email|type here|keyword|検索|メールアドレス|キーワード|探す)$/i;

export function hrefFromReactions(node: {
  transitionNodeID?: string;
  reactions?: Array<{
    actions?: Array<{ type?: string; url?: string; destinationId?: string }>;
    action?: { type?: string; url?: string; destinationId?: string };
  }>;
}): string | undefined {
  for (const reaction of node.reactions || []) {
    const actions = reaction.actions?.length
      ? reaction.actions
      : reaction.action
        ? [reaction.action]
        : [];
    for (const action of actions) {
      if (action.url) return action.url;
      if (action.destinationId) {
        return `#n-${action.destinationId.replace(/[:;]/g, "-")}`;
      }
    }
  }
  if (node.transitionNodeID) {
    return `#n-${node.transitionNodeID.replace(/[:;]/g, "-")}`;
  }
  return undefined;
}

export function hrefForLabel(label: string): string {
  const s = label.toLowerCase().replace(/\s+/g, " ").trim();
  if (/instagram/.test(s)) return "https://instagram.com";
  if (/twitter|\bx\b/.test(s)) return "https://twitter.com";
  if (/facebook/.test(s)) return "https://facebook.com";
  if (/youtube/.test(s)) return "https://youtube.com";
  if (/tiktok/.test(s)) return "https://tiktok.com";
  if (/^home$|トップ|logo/.test(s)) return "/";
  if (/about|私たち|ブランド|story/.test(s)) return "#about";
  if (/journal|blog|note|読み/.test(s)) return "#journal";
  if (/contact|footer|guide|privacy|policy|terms/.test(s)) return "#footer";
  if (/categor/.test(s)) return "#categories";
  if (/view more|featured/.test(s)) return "#featured";
  if (/cart|カート|shop|arrival|collection|view all|もっと|購入|buy|商品/.test(s)) {
    return "#shop";
  }
  if (/read more|詳しく/.test(s)) return "#about";
  return "#shop";
}

function collectText(box: LayoutBox, limit = 120): string {
  const parts: string[] = [];
  const walk = (node: LayoutBox) => {
    if (node.text) parts.push(node.text);
    if (parts.join(" ").length >= limit) return;
    for (const child of node.children) walk(child);
  };
  walk(box);
  return parts.join(" ").slice(0, limit);
}

function sectionSlug(box: LayoutBox): string | undefined {
  const blob = `${box.name} ${collectText(box, 80)}`.toLowerCase();
  if (/new arrival|arrival/.test(blob)) return "shop";
  if (/product categor|categor/.test(blob)) return "categories";
  if (/featured|collection/.test(blob) && !/new arrival/.test(blob)) return "featured";
  if (/\babout\b/.test(blob)) return "about";
  if (/\bjournal\b|blog/.test(blob)) return "journal";
  if (/footer|privacy|shopping guide|your calme/.test(blob)) return "footer";
  return undefined;
}

function isShortLabel(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t || t.length > 28) return false;
  if ((t.match(/\n/g) || []).length > 1) return false;
  return t.split(/\s+/).length <= 6;
}

function isLightFill(bg?: string): boolean {
  if (!bg) return true;
  const hex = bg.match(/#([0-9a-f]{6})/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.78;
  }
  return /rgba?\([^)]+,\s*0?\.[0-3]\d*\s*\)/.test(bg);
}

function isNavLabel(text: string): boolean {
  return NAV_EXACT.test(text.replace(/\s+/g, " ").trim());
}

function looksLikeButton(box: LayoutBox): boolean {
  if (box.assetUrl || box.icon) return false;
  const text = collectText(box, 40).replace(/\s+/g, " ").trim();
  if (!isShortLabel(text)) return false;
  if (INPUT_PLACEHOLDER_RE.test(text)) return false;
  const buttonShape = box.h >= 26 && box.h <= 88 && box.w >= 56 && box.w <= 480;
  if (!buttonShape) return false;
  if (/button|btn|^cta$/i.test(box.name)) return true;
  if (CTA_EXACT.test(text)) return true;
  if (box.bg && !isLightFill(box.bg)) return true;
  if (box.border && CTA_EXACT.test(text) && box.w <= 360) return true;
  return false;
}

function looksLikeInput(box: LayoutBox): boolean {
  if (box.assetUrl || box.icon) return false;
  if (looksLikeButton(box)) return false;
  if (box.bg && !isLightFill(box.bg)) return false;
  const name = box.name.toLowerCase();
  const text = collectText(box, 48).replace(/\s+/g, " ").trim();
  if (CTA_EXACT.test(text) || isNavLabel(text)) return false;
  const named = INPUT_NAME_RE.test(name) || INPUT_PLACEHOLDER_RE.test(text);
  if (!named) return false;
  return box.h >= 24 && box.h <= 80 && box.w >= 88 && box.w <= 800;
}

export function annotateLife(root: LayoutBox): void {
  const frameH = Math.max(root.h, 1);
  const used = new Set<string>();

  for (const child of root.children) {
    if (child.h < 160) continue;
    const slug = sectionSlug(child);
    if (!slug || used.has(slug)) continue;
    used.add(slug);
    child.sectionId = slug;
    child.role = child.role || "section";
    child.reveal = child.y > Math.max(180, frameH * 0.04);
  }

  const walk = (box: LayoutBox, absY: number, parentLinked: boolean) => {
    const text = (box.text || "").replace(/\s+/g, " ").trim();
    const topBand = absY < Math.max(130, frameH * 0.022);
    const label = text || collectText(box, 40);

    if (!box.href && !parentLinked && looksLikeButton(box)) {
      box.role = "cta";
      box.href = hrefForLabel(label);
    } else if (!parentLinked && looksLikeInput(box)) {
      box.role = "input";
      box.placeholder = INPUT_PLACEHOLDER_RE.test(label) ? label : label || "Search";
      box.inputType = /email|メール/.test(`${box.name} ${label}`)
        ? "email"
        : /search|検索|keyword|キーワード/.test(`${box.name} ${label}`)
          ? "search"
          : "text";
      box.href = undefined;
    } else if (!box.href && !parentLinked && isShortLabel(text) && box.role !== "input") {
      if (LOGO_RE.test(text) && topBand) {
        box.role = "logo";
        box.href = "/";
      } else if (isNavLabel(text) && (topBand || box.h <= 40)) {
        box.role = "nav";
        box.href = hrefForLabel(text);
      } else if (CTA_EXACT.test(text)) {
        box.role = "cta";
        box.href = hrefForLabel(text);
      } else if (LINK_EXACT.test(text)) {
        box.role = "link";
        box.href = hrefForLabel(text);
      }
    }

    if (
      !box.role &&
      box.assetUrl &&
      !box.icon &&
      box.w >= 120 &&
      box.w <= 360 &&
      box.h >= 140 &&
      box.h <= 480 &&
      absY > frameH * 0.1
    ) {
      box.role = "card";
      if (!parentLinked) box.href = box.href || "/shop";
    }

    if (LOGO_RE.test(box.name) && topBand && box.assetUrl && !box.role) {
      box.role = "logo";
      box.href = box.href || "/";
    }

    const linked = parentLinked || Boolean(box.href) || box.role === "input";
    for (const child of box.children) {
      walk(child, absY + child.y, linked);
    }
  };

  walk(root, 0, false);
  root.sectionId = root.sectionId || "top";
}

export const SITE_LIFE_CSS = `
html { scroll-behavior: smooth; }

.luca-nav, .luca-link, .luca-logo {
  cursor: pointer;
  text-decoration: none;
  color: inherit;
  background: transparent;
  border: 0;
  padding: 0;
  appearance: none;
  transition: opacity 0.2s ease;
}
.luca-nav:hover, .luca-link:hover, .luca-logo:hover { opacity: 0.7; }
.luca-cta, .luca-card {
  cursor: pointer;
  text-decoration: none;
  color: inherit;
}
.luca-cta:hover { filter: brightness(1.06); }
.luca-card img { transition: transform 0.55s ease; }
.luca-card:hover img { transform: scale(1.04); }
.luca-field { z-index: 4; }
.luca-input {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  border: 0;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  padding: 0 12px;
}
.luca-input::placeholder { color: inherit; opacity: 0.55; }

@media (max-width: 960px) {
  #top {
    aspect-ratio: auto !important;
    height: auto !important;
    min-height: 100svh;
    display: flex;
    flex-direction: column;
  }
  #top > [data-chrome] {
    position: sticky !important;
    top: 0;
    left: 0 !important;
    width: 100% !important;
    max-width: none !important;
    height: auto !important;
    min-height: 56px;
    max-height: none !important;
    z-index: 40;
    background: var(--background);
  }
  #top > [data-section] {
    position: relative !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    max-width: none !important;
    height: auto !important;
    max-height: none !important;
    aspect-ratio: var(--band-w, 16) / var(--band-h, 9);
  }
}

@media (max-width: 720px) {
  [data-row] {
    display: flex !important;
    flex-direction: column !important;
    height: auto !important;
    max-height: none !important;
    aspect-ratio: auto !important;
    gap: 16px !important;
  }
  [data-row] > * {
    position: relative !important;
    left: auto !important;
    top: auto !important;
    width: 100% !important;
    max-width: none !important;
    height: auto !important;
    max-height: none !important;
  }
  [data-row] img {
    width: 100% !important;
    max-width: 100% !important;
    height: auto !important;
    max-height: none !important;
  }
}

[data-reveal] {
  opacity: 0;
  transform: translateY(16px);
  transition: opacity 0.65s ease, transform 0.65s ease;
}
[data-reveal].is-in {
  opacity: 1;
  transform: none;
}

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  [data-reveal] { opacity: 1; transform: none; }
  .luca-card img, .luca-cta { transition: none; }
}
`;

export const SITE_LIFE_TSX = `"use client";

import { useEffect } from "react";

export function useSiteLife() {
  useEffect(() => {
    document.documentElement.style.scrollBehavior = "smooth";
    const nodes = document.querySelectorAll("[data-reveal]");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) entry.target.classList.add("is-in");
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -6% 0px" },
    );
    nodes.forEach((node) => io.observe(node));

    const onClick = (event: MouseEvent) => {
      const target = (event.target as HTMLElement | null)?.closest("a[href^='#']");
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || href === "#") return;
      const dest = document.getElementById(href.slice(1));
      if (!dest) return;
      event.preventDefault();
      dest.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const onSubmit = (event: Event) => {
      const form = event.target as HTMLFormElement | null;
      if (!form?.closest?.(".luca-field, form")) return;
      if (form.getAttribute("action")) return;
      event.preventDefault();
      const input = form.querySelector("input") as HTMLInputElement | null;
      const q = input?.value?.trim();
      if (q) {
        window.location.href = "/shop?q=" + encodeURIComponent(q);
        return;
      }
      const dest = document.getElementById("shop") || document.getElementById("top");
      dest?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    return () => {
      io.disconnect();
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
    };
  }, []);
}
`;

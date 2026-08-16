import * as cheerio from "cheerio";
import { extractFigmaUrls, inspectFigma, isFigmaUrl } from "./figma";
import type { ScreenshotPalette } from "./screenshot-palette";
import {
  cloneRequiredTokens,
  formatDesignScrapeForBrief,
  scrapeDesignFromHtml,
  type DesignScrape,
} from "./scrape-design";
// collectStyles still used for light color/font hints when screenshot palette missing

export type SectionBlueprint = {
  name: string;
  classes: string;
  heading: string;
  paragraphs: string[];
  buttons: string[];
  images: Array<{ src: string; alt: string }>;
  backgroundHint: string;
};

export type PageInspection = {
  url: string;
  path: string;
  title: string;
  description: string;
  headings: string[];
  nav: string[];
  navLinks: Array<{ label: string; href: string; path: string }>;
  buttons: string[];
  images: Array<{ src: string; alt: string }>;
  sections: string[];
  sectionBlueprints: SectionBlueprint[];
  textSample: string;
  markdown: string;
  htmlSnippet: string;
  headerHtml: string;
  footerHtml: string;
  logo: { src: string; alt: string } | null;
  brandName: string;
};

export type SiteStyleTokens = {
  colors: string[];
  fonts: string[];
  cssVariables: string[];
  stylesheetUrls: string[];
  cssSamples: string[];
};

export type UrlInspection = {
  url: string;
  origin: string;
  title: string;
  description: string;
  headings: string[];
  nav: string[];
  buttons: string[];
  images: Array<{ src: string; alt: string }>;
  colors: string[];
  fonts: string[];
  sections: string[];
  textSample: string;
  markdown: string;
  cloneMode: boolean;
  pages: PageInspection[];
  styles: SiteStyleTokens;
  /** Cheerio URL scrape: assets + button/CSS class styles (no Chromium). */
  design?: DesignScrape;
};

const URL_RE = /https?:\/\/[^\s<>"'`)\]]+/gi;

const CLONE_RE =
  /\b(clone|copy|replicate|recreate|rebuild|inspect|mirror|remake|pixel[-\s]?perfect|exact(?:ly)?|like this|same as|based on this|make this|build this|full\s*site|entire\s*site|whole\s*site|all\s*pages)\b/i;

/** Homepage-only clone — no artificial content caps. */

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_RE) || [];
  return [...new Set(matches.map((u) => u.replace(/[.,;!?]+$/, "")))];
}

export function wantsCloneOrInspect(text: string): boolean {
  if (extractFigmaUrls(text).length) return true;
  if (CLONE_RE.test(text)) return true;
  const urls = extractUrls(text);
  if (!urls.length) return false;
  const without = text.replace(URL_RE, "").trim();
  return without.length < 40;
}

function absolutize(base: string, src: string): string {
  try {
    return new URL(src, base).toString();
  } catch {
    return src;
  }
}

function unique(items: string[]): string[] {
  return [...new Set(items.map((s) => s.trim()).filter(Boolean))];
}

function pathnameOf(url: string): string {
  try {
    const u = new URL(url);
    const p = u.pathname || "/";
    return p.endsWith("/") && p.length > 1 ? p.slice(0, -1) || "/" : p || "/";
  } catch {
    return "/";
  }
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

function looksLikeAsset(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|pdf|zip|css|js|mjs|json|xml|ico|woff2?|ttf|eot|mp4|webm|mp3)(\?|$)/i.test(
    path,
  );
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms = 14000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchReadableMarkdown(url: string): Promise<string> {
  try {
    const res = await fetchWithTimeout(
      `https://r.jina.ai/${url}`,
      {
        headers: {
          Accept: "text/plain",
          "X-Return-Format": "markdown",
        },
      },
      16000,
    );
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}

async function fetchHtml(url: string): Promise<string> {
  try {
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
      },
      30000,
    );
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}

async function fetchText(url: string): Promise<string> {
  try {
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "text/css,*/*",
        },
      },
      20000,
    );
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}

function extractNavLinks(
  pageUrl: string,
  $: ReturnType<typeof cheerio.load>,
): Array<{ label: string; href: string; path: string }> {
  const origin = new URL(pageUrl).origin;
  const out: Array<{ label: string; href: string; path: string }> = [];
  const seen = new Set<string>();

  $("a[href]").each((_, el) => {
    const hrefRaw = ($(el).attr("href") || "").trim();
    if (
      !hrefRaw ||
      hrefRaw.startsWith("#") ||
      hrefRaw.startsWith("mailto:") ||
      hrefRaw.startsWith("tel:") ||
      hrefRaw.startsWith("javascript:")
    ) {
      return;
    }
    const abs = absolutize(pageUrl, hrefRaw);
    if (!sameOrigin(origin, abs)) return;
    const path = pathnameOf(abs);
    if (looksLikeAsset(path)) return;
    if (seen.has(path)) return;
    seen.add(path);
    const label = $(el).text().replace(/\s+/g, " ").trim();
    out.push({ label: label || path, href: abs, path });
  });

  const prioritized = [
    ...out.filter((l) =>
      $("nav a, header a, footer a")
        .toArray()
        .some(
          (el) =>
            pathnameOf(absolutize(pageUrl, $(el).attr("href") || "")) ===
            l.path,
        ),
    ),
    ...out,
  ];
  const dedup: typeof out = [];
  const seen2 = new Set<string>();
  for (const l of prioritized) {
    if (seen2.has(l.path)) continue;
    seen2.add(l.path);
    dedup.push(l);
  }
  return dedup;
}

function cleanHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inspectHtmlPage(
  url: string,
  html: string,
): Omit<PageInspection, "markdown"> {
  const $ = cheerio.load(html);
  $("script, noscript, iframe").remove();

  const title =
    $("title").first().text().trim() ||
    $('meta[property="og:title"]').attr("content") ||
    "";
  const description =
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    "";

  const headings = unique(
    $("h1, h2, h3")
      .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
      .get(),
  );

  const navLinks = extractNavLinks(url, $);
  const nav = unique(navLinks.map((l) => `${l.label} → ${l.path}`));

  const buttons = unique(
    $("button, a.button, [role='button'], .btn, input[type='submit']")
      .map(
        (_, el) =>
          $(el).text().replace(/\s+/g, " ").trim() ||
          $(el).attr("value") ||
          "",
      )
      .get(),
  );

  const images = $("img")
    .map((_, el) => ({
      src: absolutize(
        url,
        $(el).attr("src") ||
          $(el).attr("data-src") ||
          $(el).attr("data-lazy-src") ||
          "",
      ),
      alt: ($(el).attr("alt") || "").trim(),
    }))
    .get()
    .filter((img) => img.src && !img.src.startsWith("data:"));

  const og = $('meta[property="og:image"]').attr("content");
  if (og) {
    images.unshift({ src: absolutize(url, og), alt: "og:image" });
  }

  // Prefer real <section>s; also walk main's top-level blocks so SPA/CSS sites still list all bands
  const sectionEls = $(
    "main section, body > section, main > section, [class*='hero'], [class*='marquee'], [class*='logo'], [class*='feature'], [class*='service'], [class*='about'], [class*='testimonial'], [class*='pricing'], [class*='faq'], [class*='cta'], [class*='footer']",
  ).toArray();

  const seenSectionKeys = new Set<string>();
  const sectionBlueprints: SectionBlueprint[] = [];

  const pushBlueprint = (node: ReturnType<typeof $>, idx: number) => {
    const cls = (node.attr("class") || "").trim();
    const rawEl = node.get(0) as { tagName?: string; name?: string } | undefined;
    const tag = (rawEl?.name || rawEl?.tagName || "section").toLowerCase();
    const heading = node
      .find("h1,h2,h3")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();
    const key = `${heading}|${cls}`.slice(0, 120);
    if (seenSectionKeys.has(key)) return;
    seenSectionKeys.add(key);
    const paragraphs = unique(
      node
        .find("p")
        .map((_, p) => $(p).text().replace(/\s+/g, " ").trim())
        .get()
        .filter((t) => t.length > 20),
    ).slice(0, 6);
    const sectionButtons = unique(
      node
        .find("a, button")
        .map((_, b) => $(b).text().replace(/\s+/g, " ").trim())
        .get()
        .filter((t) => t.length > 0 && t.length < 80),
    ).slice(0, 8);
    const sectionImages = node
      .find("img")
      .map((_, img) => ({
        src: absolutize(
          url,
          $(img).attr("src") || $(img).attr("data-src") || "",
        ),
        alt: ($(img).attr("alt") || "").trim(),
      }))
      .get()
      .filter((img) => img.src && !img.src.startsWith("data:"))
      .slice(0, 8);
    const videos = node
      .find("video, source")
      .map(
        (_, v) =>
          absolutize(url, $(v).attr("src") || $(v).attr("data-src") || ""),
      )
      .get()
      .filter(Boolean);
    const style = node.attr("style") || "";
    const bgClass = cls
      .split(/\s+/)
      .filter((c) => /bg-|background|gradient|from-|to-|via-|hero|video/.test(c))
      .join(" ");
    const backgroundHint = [bgClass, style, ...videos.map((v) => `video:${v}`)]
      .filter(Boolean)
      .join(" | ");
    if (!heading && !paragraphs.length && !sectionButtons.length && !videos.length)
      return;
    sectionBlueprints.push({
      name: heading || `${tag}-${idx + 1}`,
      classes: cls,
      heading,
      paragraphs,
      buttons: sectionButtons,
      images: sectionImages,
      backgroundHint,
    });
  };

  sectionEls.forEach((el, idx) => pushBlueprint($(el), idx));

  // Fallback: every h2 defines a section band the clone must include
  $("h1, h2").each((idx, el) => {
    const heading = $(el).text().replace(/\s+/g, " ").trim();
    if (!heading || heading.length < 3) return;
    const key = `h:${heading}`;
    if (seenSectionKeys.has(key)) return;
    seenSectionKeys.add(key);
    sectionBlueprints.push({
      name: heading,
      classes: ($(el).parent().attr("class") || "").trim(),
      heading,
      paragraphs: [],
      buttons: [],
      images: [],
      backgroundHint: "from heading map — implement this band from screenshot + scrape",
    });
  });

  const sections = unique(
    sectionBlueprints.map((s) =>
      [s.name, s.classes, s.heading].filter(Boolean).join(" · "),
    ),
  );

  const textSample = $("body").text().replace(/\s+/g, " ").trim();

  const headerHtml = cleanHtml(
    $("header").first().html() ||
      $("nav").first().parent().html() ||
      $("nav").first().html() ||
      "",
  );

  const footerHtml = cleanHtml($("footer").first().html() || "");

  const logoEl = $(
    "header img, nav img, [class*='logo'] img, a[class*='logo'] img",
  ).first();
  const logoSrc = logoEl.attr("src") || logoEl.attr("data-src") || "";
  const logo = logoSrc
    ? {
        src: absolutize(url, logoSrc),
        alt: (logoEl.attr("alt") || "").trim(),
      }
    : null;

  const brandName =
    $("header a, nav a, [class*='logo']")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim() ||
    title.split(/[|\-–—]/)[0]?.trim() ||
    "";

  const mainHtml = $("main").first().html() || $("body").html() || "";
  const htmlSnippet = cleanHtml(mainHtml);

  return {
    url,
    path: pathnameOf(url),
    title,
    description,
    headings,
    nav,
    navLinks,
    buttons,
    images,
    sections,
    sectionBlueprints,
    textSample,
    htmlSnippet,
    headerHtml,
    footerHtml,
    logo,
    brandName,
  };
}

function parseHex(color: string): { r: number; g: number; b: number } | null {
  const m = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function luminance(c: { r: number; g: number; b: number }): number {
  return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
}

function inferPalette(colors: string[]): {
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  isDark: boolean;
} {
  const hexes = colors
    .map((c) => ({ raw: c, rgb: parseHex(c) }))
    .filter(
      (c): c is { raw: string; rgb: { r: number; g: number; b: number } } =>
        Boolean(c.rgb),
    );

  if (!hexes.length) {
    // Prefer light defaults — never push a dark SaaS theme without evidence
    return {
      background: "#FFFFFF",
      surface: "#F8FAFC",
      text: "#111827",
      muted: "#6B7280",
      accent: "#0F766E",
      isDark: false,
    };
  }

  const byLum = [...hexes].sort(
    (a, b) => luminance(a.rgb) - luminance(b.rgb),
  );
  const darkest = byLum[0].raw;
  const lightest = byLum[byLum.length - 1].raw;
  const isDark = luminance(byLum[0].rgb) < 0.35;

  const accentCand = hexes
    .map((h) => {
      const { r, g, b } = h.rgb;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      return { raw: h.raw, sat, lum: luminance(h.rgb) };
    })
    .filter((h) => h.sat > 0.25 && h.lum > 0.15 && h.lum < 0.85)
    .sort((a, b) => b.sat - a.sat);

  const accent = accentCand[0]?.raw || (isDark ? "#3b82f6" : "#2563eb");
  const surface = byLum[Math.min(1, byLum.length - 1)]?.raw || darkest;

  return {
    background: isDark ? darkest : lightest,
    surface: isDark
      ? surface
      : byLum[Math.max(0, byLum.length - 2)]?.raw || "#f8fafc",
    text: isDark ? lightest : darkest,
    muted: isDark ? "#94a3b8" : "#64748b",
    accent,
    isDark,
  };
}

function extractColorsAndFonts(cssText: string): {
  colors: string[];
  fonts: string[];
  cssVariables: string[];
} {
  const colorMatches =
    cssText.match(
      /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|rgba?\([^)]+\)|hsla?\([^)]+\)/g,
    ) || [];
  const colors = unique(colorMatches);

  const fontMatches =
    cssText
      .match(/font-family:\s*([^;}{]+)/gi)
      ?.map((m) =>
        m.replace(/font-family:\s*/i, "").replace(/["']/g, "").trim(),
      ) || [];
  const fonts = unique(fontMatches);

  const cssVariables = unique(
    (cssText.match(/--[\w-]+\s*:\s*[^;}{]+/g) || []).map((v) => v.trim()),
  );

  return { colors, fonts, cssVariables };
}

async function collectStyles(
  pageUrl: string,
  html: string,
): Promise<SiteStyleTokens> {
  const $ = cheerio.load(html);
  const stylesheetUrls = unique(
    $('link[rel="stylesheet"]')
      .map((_, el) => absolutize(pageUrl, $(el).attr("href") || ""))
      .get()
      .filter(Boolean),
  );

  const inlineCss = $("style")
    .map((_, el) => $(el).html() || "")
    .get()
    .join("\n");

  const sheets = await Promise.all(stylesheetUrls.map((u) => fetchText(u)));

  const combined = [inlineCss, ...sheets].filter(Boolean).join("\n");
  const tokens = extractColorsAndFonts(combined);

  const cssSamples = unique(
    (
      combined.match(
        /(?::root|html|body|header|nav|footer|\.btn|\.button|a\s*\{)[^{]*\{[^}]{0,800}\}/gi,
      ) || []
    ).map((s) => s.replace(/\s+/g, " ").trim()),
  );

  return {
    colors: tokens.colors,
    fonts: tokens.fonts,
    cssVariables: tokens.cssVariables,
    stylesheetUrls,
    cssSamples,
  };
}

async function inspectSinglePage(
  url: string,
  withMarkdown: boolean,
): Promise<{ page: PageInspection; html: string }> {
  const html = await fetchHtml(url);
  if (!html) {
    return {
      html: "",
      page: {
        url,
        path: pathnameOf(url),
        title: "",
        description: "",
        headings: [],
        nav: [],
        navLinks: [],
        buttons: [],
        images: [],
        sections: [],
        sectionBlueprints: [],
        textSample: "",
        markdown: "",
        htmlSnippet: "",
        headerHtml: "",
        footerHtml: "",
        logo: null,
        brandName: "",
      },
    };
  }
  const base = inspectHtmlPage(url, html);
  const markdown = withMarkdown ? await fetchReadableMarkdown(url) : "";
  return {
    html,
    page: {
      ...base,
      markdown: markdown || base.textSample,
    },
  };
}

export async function inspectUrl(
  url: string,
  cloneMode: boolean,
): Promise<UrlInspection> {
  // Homepage only — URL scrape (cheerio), no Chromium
  const home = await inspectSinglePage(url, true);

  let design: DesignScrape | undefined;
  let styles: SiteStyleTokens = {
    colors: [],
    fonts: [],
    cssVariables: [],
    stylesheetUrls: [],
    cssSamples: [],
  };

  if (home.html) {
    const [designResult, styleResult] = await Promise.all([
      scrapeDesignFromHtml(url, home.html),
      collectStyles(url, home.html),
    ]);
    design = designResult;
    styles = styleResult;
  }

  const page = home.page;
  const images = unique(
    [
      ...page.images.map((i) => `${i.alt}|||${i.src}`),
      ...(design?.images || []).map((i) => `${i.alt}|||${i.src}`),
    ],
  ).map((row) => {
    const [alt, src] = row.split("|||");
    return { alt: alt || "", src: src || "" };
  });

  void cloneMode;

  return {
    url,
    origin: (() => {
      try {
        return new URL(url).origin;
      } catch {
        return url;
      }
    })(),
    title: page.title,
    description: page.description,
    headings: page.headings,
    nav: page.nav,
    buttons: page.buttons,
    images,
    colors: styles.colors,
    fonts: styles.fonts,
    sections: page.sections,
    textSample: page.textSample,
    markdown: page.markdown,
    cloneMode,
    pages: [page],
    styles,
    design,
  };
}

function formatBlueprint(bp: SectionBlueprint, i: number): string {
  return [
    `#### Section ${i + 1}: ${bp.heading || bp.name}`,
    `Classes: ${bp.classes || "(none)"}`,
    bp.backgroundHint ? `Background hints: ${bp.backgroundHint}` : "",
    bp.heading ? `Heading: ${bp.heading}` : "",
    bp.paragraphs.length
      ? `Paragraphs:\n${bp.paragraphs.map((p) => `  - ${p}`).join("\n")}`
      : "",
    bp.buttons.length
      ? `Buttons: ${bp.buttons.map((b) => `"${b}"`).join(", ")}`
      : "",
    bp.images.length
      ? `Images:\n${bp.images.map((img) => `  - ${img.src}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatInspectionReport(
  report: UrlInspection,
  shotPalette?: ScreenshotPalette | null,
): string {
  const home = report.pages[0];
  const design = report.design;

  // Screenshot pixels for mood; CSS scrape for exact colors/classes
  const fromCss = inferPalette(
    report.styles.colors.length ? report.styles.colors : report.colors,
  );
  const palette = shotPalette
    ? {
        background: shotPalette.background,
        surface: shotPalette.surface,
        text: shotPalette.text,
        muted: shotPalette.muted,
        // Prefer saturated CSS accent when screenshot accent is weak
        accent: shotPalette.accent || fromCss.accent,
        isDark: shotPalette.isDark,
        border: shotPalette.border,
      }
    : fromCss;

  const brand =
    home?.brandName || report.title.split(/[|\-–—]/)[0]?.trim() || "Site";
  const logo = home?.logo;

  const navItems = unique(
    (home?.navLinks || []).map((l) => `${l.label}|${l.path}`),
  ).map((row) => {
    const [label, path] = row.split("|");
    return { label, path };
  });

  if (!report.cloneMode) {
    return [
      `# WEBSITE INSPECTION REPORT`,
      `Source: ${report.url}`,
      `Title: ${report.title}`,
      `Colors: ${report.styles.colors.join(", ")}`,
      `Fonts: ${report.styles.fonts.join(" | ")}`,
      `Images: ${report.images.length}`,
      `Videos: ${design?.videos.length ?? 0}`,
      `Nav: ${report.nav.join(" | ")}`,
      design ? formatDesignScrapeForBrief(design) : "",
      report.markdown,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const required = design ? cloneRequiredTokens(design) : [];
  const headingList = unique(home?.headings || []).slice(0, 24);
  const logoSrc = logo?.src || design?.logoUrl || null;

  return [
    `# HOMEPAGE CLONE BRIEF`,
    `Source: ${report.url}`,
    `Brand: ${brand}`,
    `Mood hint from screenshot pixels: ${palette.isDark ? "DARK" : "LIGHT"}`,
    required.length ? `CLONE_REQUIRED_TOKENS: ${required.join("|")}` : "",
    "",
    `## HOW TO BUILD (read carefully)`,
    `1) The attached FULL-PAGE SCREENSHOT is the ONLY design spec.`,
    `   Scroll it. Recreate layout, spacing, colors, typography, buttons, and EVERY section you see — top to footer.`,
    `2) The ASSETS list below is ONLY for real media URLs (images/videos/logo/icons).`,
    `   Plug those URLs into the UI you design from the screenshot. Do NOT copy CSS classes from the source site.`,
    `3) Style everything yourself with Tailwind to MATCH THE SCREENSHOT (colors, radii, button look, hero layout).`,
    "",
    `## ⚠ HARD RULES`,
    `- Screenshot = design. Assets list = media URLs only.`,
    `- Implement the ENTIRE page visible in the screenshot (not just the hero).`,
    `- Use scraped image/video URLs when the screenshot shows that media.`,
    `- Never replace real photos/videos with 3D icons or placeholders.`,
    `- Keep full headline text from the screenshot.`,
    `- Homepage only — no extra routes.`,
    "",
    `## COLOR HINTS (from screenshot pixels — refine by looking at the image)`,
    `- bg ≈ ${palette.background}, text ≈ ${palette.text}, accent ≈ ${palette.accent}`,
    `- Trust the screenshot over these hints if they disagree.`,
    "",
    design ? formatDesignScrapeForBrief(design) : "",
    "",
    `## SECTIONS SEEN IN COPY / HTML (cross-check against screenshot — build what the screenshot shows)`,
    ...(headingList.length
      ? headingList.map((h, i) => `${i + 1}. ${h}`)
      : ["(use screenshot scroll order)"]),
    "",
    `## FILES`,
    `- components/site-header.tsx`,
    `- components/site-footer.tsx`,
    `- components/site-shell.tsx`,
    `- app/page.tsx (all sections)`,
    "",
    `## BUILD ORDER`,
    `1. think — describe what you SEE in the screenshot section-by-section`,
    `2. set_project`,
    `3. header → footer → shell → page matching the screenshot`,
    `4. wire asset URLs from the list into the matching spots`,
    `5. suggest_actions → finish`,
    "",
    `## HEADER / NAV HINTS`,
    `- Logo: ${logoSrc || "(from screenshot / assets)"}`,
    `- Brand: ${brand}`,
    ...navItems.map((n) => `- Nav: "${n.label}"`),
    "",
    `## COPY (for text accuracy)`,
    home?.markdown || report.markdown,
  ]
    .filter(Boolean)
    .join("\n");
}

export type UrlEnrichment = {
  text: string;
  /** Images sent to the model (may be resized). */
  inlineImages: Array<{
    mimeType: string;
    base64: string;
    label?: string;
  }>;
  /** Full-res shots to store/show in chat UI. */
  chatImages: Array<{
    mimeType: string;
    base64: string;
    label?: string;
  }>;
  skeletonFiles?: import("./types").ProjectFile[];
  skeletonKind?: import("./figma-frame").FigmaFrameKind;
};

export async function enrichTextWithUrlInspections(
  text: string,
  opts?: {
    figmaAccessToken?: string | null;
    refreshFigmaToken?: () => Promise<string | null>;
    figmaHandle?: string;
    existingHome?: boolean;
    figmaPlanAllowed?: boolean;
    onFigmaInspectSuccess?: () => Promise<void>;
  },
): Promise<UrlEnrichment> {
  const urls = extractUrls(text);
  if (!urls.length) return { text, inlineImages: [], chatImages: [] };

  const figmaUrls = urls.filter(isFigmaUrl);
  const webUrls = urls.filter((u) => !isFigmaUrl(u));
  const cloneMode = wantsCloneOrInspect(text);

  const inlineImages: UrlEnrichment["inlineImages"] = [];
  const chatImages: UrlEnrichment["chatImages"] = [];
  const blocks: string[] = [];
  const skeletonFiles: import("./types").ProjectFile[] = [];
  let skeletonKind: import("./figma-frame").FigmaFrameKind | undefined;

  for (const url of figmaUrls) {
    try {
      const figma = await inspectFigma(url, opts?.figmaAccessToken, {
        refreshAccessToken: opts?.refreshFigmaToken,
        figmaHandle: opts?.figmaHandle,
        existingHome: opts?.existingHome,
        planAllowed: opts?.figmaPlanAllowed,
        onSuccessfulInspect: opts?.onFigmaInspectSuccess,
      });
      if (!figma) continue;
      blocks.push(figma.brief);
      if (figma.skeletonFiles?.length) {
        skeletonFiles.push(...figma.skeletonFiles);
      }
      if (figma.frameKind) skeletonKind = figma.frameKind;
      const { prepareFigmaFrameForModel } = await import("./site-screenshot");
      for (const shot of figma.shots) {
        try {
          const prepared = await prepareFigmaFrameForModel(shot.base64);
          const labeled = {
            mimeType: prepared.mimeType,
            base64: prepared.base64,
            label: `${shot.label} (${prepared.width}×${prepared.height})`,
          };
          chatImages.push(labeled);
          inlineImages.push(labeled);
        } catch {
          chatImages.push(shot);
          inlineImages.push(shot);
        }
      }
    } catch (err) {
      console.error("[inspect-url] figma", url, err);
    }
  }

  if (!webUrls.length) {
    if (!blocks.length) return { text, inlineImages, chatImages };
    const blocked = blocks.some((b) =>
      /FIGMA_NEEDS_CONNECT:\s*1|FIGMA_ACCESS_DENIED:\s*1|FIGMA_TOKEN_INVALID:\s*1|FIGMA_PLAN_REQUIRED:\s*1|# FIGMA BLOCKED/i.test(
        b,
      ),
    );
    const planRequired = blocks.some((b) =>
      /FIGMA_PLAN_REQUIRED:\s*1/i.test(b),
    );
    const shotNote =
      !blocked && inlineImages.length
        ? "\n\nFIGMA FRAME screenshot is vision only — do not place it in the page. Compile this frame to FIGMA_ROUTE. If FIGMA_PAGE: 1, keep the existing home canvas — do not replace app/page.tsx."
        : blocked
          ? planRequired
            ? "\n\nFIGMA is on Plus and Pro. Do not build. Tell the user to upgrade, then finish."
            : "\n\nFIGMA is not readable. Do not build. Tell the user to invite the connected Figma account as Viewer, then finish."
          : "";
    return {
      text: `${text}${shotNote}\n\n${blocks.join("\n\n---\n\n")}`,
      inlineImages,
      chatImages,
      skeletonFiles: skeletonFiles.length ? skeletonFiles : undefined,
      skeletonKind,
    };
  }

  const { captureSiteScreenshot, prepareScreenshotForModel } = await import(
    "./site-screenshot"
  );

  const reports = await Promise.all(
    webUrls.map(async (url) => {
      try {
        console.info(
          `[inspect-url] ${cloneMode ? "HOMEPAGE CLONE" : "inspect"} ${url}`,
        );

        let shot: Awaited<ReturnType<typeof captureSiteScreenshot>> = null;
        if (cloneMode) {
          console.info(`[inspect-url] capturing FULL-PAGE screenshot… ${url}`);
          shot = await captureSiteScreenshot(url);
          if (!shot) {
            console.warn(`[inspect-url] screenshot failed ${url}`);
          } else {
            console.info(
              `[inspect-url] screenshot ready ${shot.provider} ${shot.width}x${shot.height}`,
            );
          }
        }

        const report = await inspectUrl(url, cloneMode);
        return { report, shot };
      } catch (err) {
        console.error("[inspect-url]", url, err);
        return null;
      }
    }),
  );

  for (const item of reports) {
    if (!item?.report) continue;
    const r = item.report;
    console.info(
      `[inspect-url] done ${r.url} images=${r.images.length} videos=${r.design?.videos.length ?? 0} sections=${r.pages[0]?.sectionBlueprints?.length ?? 0} shot=${Boolean(item.shot)}`,
    );

    let shotPalette: ScreenshotPalette | null = null;
    if (item.shot) {
      const { paletteFromScreenshot } = await import("./screenshot-palette");
      shotPalette = await paletteFromScreenshot(item.shot.base64);
      if (shotPalette) {
        console.info(
          `[inspect-url] screenshot palette mood=${shotPalette.mood} bg=${shotPalette.background} accent=${shotPalette.accent}`,
        );
      }

      try {
        const prepared = await prepareScreenshotForModel(
          item.shot.base64,
          item.shot.mimeType,
        );
        const labeled = {
          mimeType: prepared.mimeType,
          base64: prepared.base64,
          label: `${item.shot.label} (${prepared.width}×${prepared.height})`,
        };
        chatImages.push(labeled);
        inlineImages.push(labeled);
      } catch {
        const labeled = {
          mimeType: item.shot.mimeType,
          base64: item.shot.base64,
          label: item.shot.label,
        };
        chatImages.push(labeled);
        inlineImages.push(labeled);
      }
    }

    blocks.push(formatInspectionReport(r, shotPalette));
  }

  if (!blocks.length) return { text, inlineImages, chatImages };

  const figmaNote = figmaUrls.length && inlineImages.length
    ? "\n\nFIGMA SCREENSHOTS attached. Match the file exactly — layout, type, color, assets."
    : "";
  const shotNote =
    cloneMode && webUrls.length && inlineImages.length
      ? "\n\nFULL-PAGE SCREENSHOT attached (scroll it). COPY scraped videos + CSS classes. Build EVERY section to the footer — not just the hero."
      : cloneMode && webUrls.length
        ? "\n\nWARNING: Screenshot failed — still build ALL sections from HTML scrape + videos/CSS."
        : "";

  return {
    text: `${text}${figmaNote}${shotNote}\n\n${blocks.join("\n\n---\n\n")}`,
    inlineImages,
    chatImages,
    skeletonFiles: skeletonFiles.length ? skeletonFiles : undefined,
    skeletonKind,
  };
}

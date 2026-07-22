import * as cheerio from "cheerio";

export type ScrapedImage = {
  src: string;
  alt: string;
};

export type ScrapedVideo = {
  src: string;
  type: "video" | "iframe" | "source";
  poster?: string;
};

export type ScrapedIcon = {
  src?: string;
  kind: "img" | "svg" | "icon-font";
  label?: string;
};

/** Assets-only scrape — no CSS class/style extraction for clones. */
export type DesignScrape = {
  images: ScrapedImage[];
  videos: ScrapedVideo[];
  icons: ScrapedIcon[];
  logoUrl: string | null;
  fontStylesheetUrls: string[];
  /** Kept for non-clone inspect reports; empty for clone-focused use. */
  fonts: string[];
  colors: string[];
  cssVariables: string[];
  stylesheetUrls: string[];
  buttonStyles: never[];
  linkStyles: never[];
  headerStyles: never[];
  reusableCssBlocks: never[];
};

function unique(items: string[]): string[] {
  return [...new Set(items.map((s) => s.trim()).filter(Boolean))];
}

function absolutize(base: string, src: string): string {
  try {
    return new URL(src, base).toString();
  } catch {
    return src;
  }
}

function scrapeVideos(
  pageUrl: string,
  $: ReturnType<typeof cheerio.load>,
): ScrapedVideo[] {
  const videos: ScrapedVideo[] = [];
  const seen = new Set<string>();

  $("video").each((_, el) => {
    const src = absolutize(
      pageUrl,
      $(el).attr("src") || $(el).find("source").first().attr("src") || "",
    );
    if (!src || seen.has(src)) return;
    seen.add(src);
    videos.push({
      src,
      type: "video",
      poster: $(el).attr("poster")
        ? absolutize(pageUrl, $(el).attr("poster") || "")
        : undefined,
    });
  });

  $("source[src]").each((_, el) => {
    const src = absolutize(pageUrl, $(el).attr("src") || "");
    if (!src || seen.has(src)) return;
    if (!/\.(mp4|webm|ogg|mov)(\?|$)/i.test(src) && !/video/i.test(src))
      return;
    seen.add(src);
    videos.push({ src, type: "source" });
  });

  $("iframe[src]").each((_, el) => {
    const src = absolutize(pageUrl, $(el).attr("src") || "");
    if (!src || seen.has(src)) return;
    if (!/(youtube|youtu\.be|vimeo|wistia|loom|player\.)/i.test(src)) return;
    seen.add(src);
    videos.push({ src, type: "iframe" });
  });

  $("[data-video], [data-src*='.mp4'], [data-background-video]").each(
    (_, el) => {
      const src = absolutize(
        pageUrl,
        $(el).attr("data-video") ||
          $(el).attr("data-src") ||
          $(el).attr("data-background-video") ||
          "",
      );
      if (!src || seen.has(src)) return;
      seen.add(src);
      videos.push({ src, type: "video" });
    },
  );

  return videos;
}

function scrapeImages(
  pageUrl: string,
  $: ReturnType<typeof cheerio.load>,
): ScrapedImage[] {
  const images: ScrapedImage[] = [];
  const seen = new Set<string>();

  $("img").each((_, el) => {
    const src = absolutize(
      pageUrl,
      $(el).attr("src") ||
        $(el).attr("data-src") ||
        $(el).attr("data-lazy-src") ||
        $(el).attr("data-original") ||
        "",
    );
    if (!src || src.startsWith("data:") || seen.has(src)) return;
    seen.add(src);
    images.push({
      src,
      alt: ($(el).attr("alt") || "").trim(),
    });
  });

  $("[style*='url(']").each((_, el) => {
    const style = $(el).attr("style") || "";
    const m = style.match(/url\(['"]?([^'")]+)['"]?\)/i);
    if (!m?.[1]) return;
    const src = absolutize(pageUrl, m[1]);
    if (!src || src.startsWith("data:") || seen.has(src)) return;
    if (!/\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(src)) return;
    seen.add(src);
    images.push({ src, alt: "background" });
  });

  const og = $('meta[property="og:image"]').attr("content");
  if (og) {
    const src = absolutize(pageUrl, og);
    if (src && !seen.has(src)) {
      seen.add(src);
      images.unshift({ src, alt: "og:image" });
    }
  }

  return images;
}

function scrapeIcons(
  pageUrl: string,
  $: ReturnType<typeof cheerio.load>,
): ScrapedIcon[] {
  const icons: ScrapedIcon[] = [];

  $(
    "img[src*='icon'], img[class*='icon'], img[alt*='icon' i], img[alt*='logo' i]",
  ).each((_, el) => {
    icons.push({
      src: absolutize(pageUrl, $(el).attr("src") || ""),
      kind: "img",
      label: ($(el).attr("alt") || "").trim(),
    });
  });

  $("svg").each((i, el) => {
    if (i > 30) return;
    icons.push({
      kind: "svg",
      label: ($(el).attr("aria-label") || "").trim() || undefined,
    });
  });

  return icons;
}

/**
 * URL scrape for clone assets only (images / videos / icons / logo / font links).
 * No CSS class or style extraction — screenshot drives the design.
 */
export async function scrapeDesignFromHtml(
  pageUrl: string,
  html: string,
): Promise<DesignScrape> {
  const $ = cheerio.load(html);

  const fontStylesheetUrls = unique(
    $(
      'link[href*="fonts.googleapis.com"], link[href*="fonts.gstatic.com"], link[rel="stylesheet"][href*="font"]',
    )
      .map((_, el) => absolutize(pageUrl, $(el).attr("href") || ""))
      .get()
      .filter(Boolean),
  );

  const logoEl = $(
    "header img, nav img, [class*='logo'] img, a[class*='logo'] img",
  ).first();
  const logoSrc = logoEl.attr("src") || logoEl.attr("data-src") || "";
  const logoUrl = logoSrc ? absolutize(pageUrl, logoSrc) : null;

  return {
    images: scrapeImages(pageUrl, $),
    videos: scrapeVideos(pageUrl, $),
    icons: scrapeIcons(pageUrl, $),
    logoUrl,
    fontStylesheetUrls,
    fonts: [],
    colors: [],
    cssVariables: [],
    stylesheetUrls: [],
    buttonStyles: [],
    linkStyles: [],
    headerStyles: [],
    reusableCssBlocks: [],
  };
}

/** Asset URL fragments the clone must use when present. */
export function cloneRequiredTokens(design: DesignScrape): string[] {
  const tokens: string[] = [];
  for (const v of design.videos.slice(0, 6)) {
    try {
      const part = decodeURIComponent(
        new URL(v.src).pathname.split("/").pop() || "",
      );
      if (part.length > 4) tokens.push(part);
    } catch {
      /* ignore */
    }
  }
  if (design.logoUrl) {
    try {
      const part = decodeURIComponent(
        new URL(design.logoUrl).pathname.split("/").pop() || "",
      );
      if (part.length > 4) tokens.push(part);
    } catch {
      /* ignore */
    }
  }
  return [...new Set(tokens)].slice(0, 10);
}

/** Brief section: assets only. Design comes from the screenshot. */
export function formatDesignScrapeForBrief(design: DesignScrape): string {
  return [
    `## ASSETS FROM SITE (use these URLs — design/styles come from SCREENSHOT only)`,
    `Do NOT invent styles from CSS dumps. Look at the screenshot and recreate colors, spacing, buttons, and layout yourself.`,
    "",
    `### Videos (use <video autoPlay muted loop playsInline src="…"> when the screenshot shows video/motion)`,
    ...(design.videos.length
      ? design.videos.map((v) => `- ${v.src}${v.poster ? ` poster=${v.poster}` : ""}`)
      : ["- (none found)"]),
    "",
    `### Images (prefer these exact src values in <img>)`,
    ...(design.images.length
      ? design.images
          .slice(0, 80)
          .map((img) => `- src="${img.src}"${img.alt ? ` alt="${img.alt}"` : ""}`)
      : ["- (none)"]),
    "",
    `### Logo`,
    design.logoUrl ? `- ${design.logoUrl}` : "- (none)",
    "",
    `### Icon / logo image hints`,
    ...(design.icons.filter((i) => i.src).length
      ? design.icons
          .filter((i) => i.src)
          .slice(0, 30)
          .map((ic) => `- ${ic.src}${ic.label ? ` (${ic.label})` : ""}`)
      : ["- (use lucide-react for simple icons if no asset matches)"]),
    "",
    `### Font stylesheets (optional — only if screenshot typography needs them)`,
    ...(design.fontStylesheetUrls.length
      ? design.fontStylesheetUrls.map((u) => `- ${u}`)
      : ["- (pick fonts that match the screenshot)"]),
  ].join("\n");
}

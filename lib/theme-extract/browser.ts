import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { ensurePlaywrightBrowsersPath } from "../playwright-env";
import type { ExtractThemeOptions } from "./types";

const DEFAULT_VIEWPORT = { width: 1440, height: 900 };

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/** Domains / patterns that are ads, trackers, or heavy media we can skip. */
const BLOCK_URL_RE =
  /(?:doubleclick\.net|googlesyndication\.com|googleadservices\.com|adservice\.google|facebook\.com\/tr|connect\.facebook\.net|hotjar\.com|clarity\.ms|segment\.io|cdn\.segment\.com|optimizely\.com|taboola\.com|outbrain\.com|adsystem|adservice|advertising|pagead|\/ads\/|analytics\.|gtag\/|googletagmanager\.com)/i;

export type ThemeBrowserSession = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
};

export async function createThemeBrowserSession(
  options: ExtractThemeOptions = {},
): Promise<ThemeBrowserSession> {
  ensurePlaywrightBrowsersPath();
  const viewport = options.viewport ?? DEFAULT_VIEWPORT;
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-extensions",
    ],
  });

  const context = await browser.newContext({
    viewport,
    userAgent: options.userAgent ?? DEFAULT_UA,
    javaScriptEnabled: true,
    bypassCSP: false,
    // Color scheme is set per-pass via emulateMedia
    colorScheme: "light",
  });

  const page = await context.newPage();

  await page.route("**/*", async (route) => {
    const req = route.request();
    const type = req.resourceType();
    const url = req.url();

    // Keep CSS, fonts, documents, XHR/fetch (for CSS-in-JS / stylesheets), scripts, SVGs
    if (type === "media" || type === "websocket" || type === "eventsource") {
      return route.abort();
    }

    // Block raster images & fonts from ad CDNs; allow fonts otherwise
    if (type === "image") {
      // Allow SVG images (often logos / icons)
      if (/\.svg(\?|$)/i.test(url) || url.includes("image/svg")) {
        return route.continue();
      }
      return route.abort();
    }

    if (BLOCK_URL_RE.test(url)) {
      return route.abort();
    }

    return route.continue();
  });

  return {
    browser,
    context,
    page,
    close: async () => {
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
    },
  };
}

export async function navigateAndWait(
  page: Page,
  url: string,
  timeoutMs: number,
): Promise<void> {
  await page.goto(url, {
    waitUntil: "networkidle",
    timeout: timeoutMs,
  });
}

export { DEFAULT_VIEWPORT };

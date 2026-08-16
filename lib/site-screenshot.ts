import { chromium } from "playwright";
import { resolvePlaywrightChromium } from "./playwright-env";

export type SiteScreenshot = {
  mimeType: string;
  base64: string;
  label: string;
  sourceUrl: string;
  provider: string;
  width?: number;
  height?: number;
};

async function dimsOf(
  buffer: Buffer,
): Promise<{ width: number; height: number } | null> {
  try {
    const sharp = (await import("sharp")).default;
    const m = await sharp(buffer, { failOn: "none" }).metadata();
    if (!m.width || !m.height) return null;
    return { width: m.width, height: m.height };
  } catch {
    return null;
  }
}

function isTallFullPage(width?: number, height?: number): boolean {
  if (!width || !height) return false;
  // Real full-page is much taller than a single desktop viewport
  return height >= Math.max(2200, Math.round(width * 1.35));
}

/**
 * True full-page capture via local Chromium.
 * URL APIs (Microlink free) only return one viewport — do not use them for "full page".
 */
async function viaPlaywrightFullPage(
  pageUrl: string,
): Promise<SiteScreenshot | null> {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    const { executablePath } = resolvePlaywrightChromium();
    browser = await chromium.launch({
      headless: true,
      executablePath: executablePath || undefined,
      args: ["--disable-dev-shm-usage", "--no-sandbox", "--disable-gpu"],
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (
        /(?:doubleclick|googlesyndication|googleadservices|hotjar|clarity\.ms|googletagmanager)/i.test(
          url,
        )
      ) {
        return route.abort();
      }
      return route.continue();
    });

    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 55_000 });
    try {
      await page.waitForLoadState("networkidle", { timeout: 15_000 });
    } catch {
      /* ok */
    }
    await new Promise((r) => setTimeout(r, 600));

    // Lazy-load scroll (string eval — no bundler helpers)
    try {
      await page.evaluate(
        new Function(`
          return (async function () {
            function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
            var h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 1);
            for (var y = 0; y < h; y += 900) {
              window.scrollTo(0, y);
              await sleep(100);
            }
            window.scrollTo(0, 0);
            await sleep(300);
          })();
        `) as () => Promise<void>,
      );
    } catch (err) {
      console.warn("[screenshot] scroll pass skipped", err);
    }

    const buffer = await page.screenshot({
      type: "jpeg",
      quality: 80,
      fullPage: true,
    });
    await context.close().catch(() => undefined);
    if (!buffer?.length) return null;

    const dims = await dimsOf(buffer);
    if (!isTallFullPage(dims?.width, dims?.height)) {
      console.warn(
        `[screenshot] playwright shot not tall enough (${dims?.width}x${dims?.height}) — rejecting`,
      );
      // Still return it if it's the best we have; caller may accept
    }

    return {
      mimeType: "image/jpeg",
      base64: buffer.toString("base64"),
      label: `FULL-PAGE screenshot ${dims?.width || "?"}×${dims?.height || "?"} — scroll in chat to see every section`,
      sourceUrl: pageUrl,
      provider: "playwright-fullpage",
      width: dims?.width,
      height: dims?.height,
    };
  } catch (err) {
    console.warn("[screenshot] playwright fullpage failed", err);
    return null;
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

/**
 * Capture a real full-page screenshot for clone (must be tall).
 * No Microlink viewport fallback — that is only one screen and misleads the model.
 */
export async function captureSiteScreenshot(
  pageUrl: string,
): Promise<SiteScreenshot | null> {
  // Retry once — first launch can fail if browsers path was wrong
  for (let attempt = 1; attempt <= 2; attempt++) {
    const shot = await viaPlaywrightFullPage(pageUrl);
    if (shot && isTallFullPage(shot.width, shot.height)) {
      console.info(
        `[screenshot] ${shot.provider} ok ${pageUrl} ${shot.width}x${shot.height}`,
      );
      return shot;
    }
    if (shot) {
      console.warn(
        `[screenshot] attempt ${attempt} short (${shot.width}x${shot.height}), retrying…`,
      );
    } else {
      console.warn(`[screenshot] attempt ${attempt} failed, retrying…`);
    }
  }

  console.error(
    "[screenshot] FULL-PAGE capture failed. Run: npx playwright install chromium",
  );
  return null;
}

/** Higher-res JPEG so Figma type, radii, and image crops stay readable. */
export async function prepareFigmaFrameForModel(
  base64: string,
): Promise<{ base64: string; mimeType: string; width: number; height: number }> {
  const sharp = (await import("sharp")).default;
  const input = Buffer.from(base64, "base64");
  const meta = await sharp(input, { failOn: "none" }).metadata();
  const targetW = 1600;
  let pipeline = sharp(input, { failOn: "none" }).rotate();
  if ((meta.width || 0) > targetW) {
    pipeline = pipeline.resize({
      width: targetW,
      withoutEnlargement: true,
    });
  }
  const buffer = await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  const out = await sharp(buffer).metadata();
  return {
    base64: buffer.toString("base64"),
    mimeType: "image/jpeg",
    width: out.width || targetW,
    height: out.height || meta.height || 0,
  };
}

/** Resize by WIDTH only so tall full-page shots stay tall. */
export async function prepareScreenshotForModel(
  base64: string,
  _mimeType: string,
): Promise<{ base64: string; mimeType: string; width: number; height: number }> {
  const sharp = (await import("sharp")).default;
  const input = Buffer.from(base64, "base64");
  const meta = await sharp(input, { failOn: "none" }).metadata();
  const targetW = 1200;
  let pipeline = sharp(input, { failOn: "none" }).rotate();
  if ((meta.width || 0) > targetW) {
    pipeline = pipeline.resize({
      width: targetW,
      withoutEnlargement: true,
    });
  }
  const buffer = await pipeline.jpeg({ quality: 78, mozjpeg: true }).toBuffer();
  const out = await sharp(buffer).metadata();
  return {
    base64: buffer.toString("base64"),
    mimeType: "image/jpeg",
    width: out.width || targetW,
    height: out.height || meta.height || 0,
  };
}

/** Save clone screenshots without squashing into a 1280×1280 box. */
export async function prepareScreenshotForChat(
  base64: string,
): Promise<{ buffer: Buffer; mimeType: string; width: number; height: number }> {
  const prepared = await prepareScreenshotForModel(base64, "image/jpeg");
  return {
    buffer: Buffer.from(prepared.base64, "base64"),
    mimeType: prepared.mimeType,
    width: prepared.width,
    height: prepared.height,
  };
}

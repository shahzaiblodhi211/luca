import {
  colorToHex,
  extractHexFromBoxShadow,
} from "./color-utils";
import {
  categorizePass,
  mergePalettes,
  pickPreferredScheme,
} from "./categorize";
import {
  createThemeBrowserSession,
  navigateAndWait,
  DEFAULT_VIEWPORT,
} from "./browser";
import {
  collectAssetsInPage,
  collectThemePassInPage,
  type InPageRawPass,
} from "./in-page";
import type {
  ColorSchemePass,
  CssVariableToken,
  ElementComputedColors,
  ExtractThemeOptions,
  ManifestColors,
  ThemeAssets,
  ThemeBlueprint,
  ThemePassResult,
} from "./types";

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new ThemeExtractError("URL is empty", "INVALID_URL");
  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new ThemeExtractError(`Invalid URL: ${input}`, "INVALID_URL");
  }
  if (!/^https?:$/i.test(url.protocol)) {
    throw new ThemeExtractError(
      `Unsupported protocol: ${url.protocol}`,
      "INVALID_URL",
    );
  }
  return url.toString();
}

export class ThemeExtractError extends Error {
  code: "INVALID_URL" | "TIMEOUT" | "NAVIGATION" | "EXTRACT" | "UNKNOWN";

  constructor(
    message: string,
    code: ThemeExtractError["code"] = "UNKNOWN",
  ) {
    super(message);
    this.name = "ThemeExtractError";
    this.code = code;
  }
}

function normalizePass(raw: InPageRawPass): {
  cssVariables: CssVariableToken[];
  elements: ElementComputedColors[];
} {
  const cssVariables: CssVariableToken[] = raw.cssVariables
    .map((v) => {
      const hex = colorToHex(v.resolved) || colorToHex(v.rawValue);
      return {
        name: v.name,
        rawValue: v.rawValue,
        resolved: v.resolved,
        hex,
        source: v.source,
      };
    })
    .filter((v) => v.hex !== null);

  const elements: ElementComputedColors[] = raw.elements.map((el) => {
    const backgroundHex = colorToHex(el.backgroundColor || null);
    const colorHex = colorToHex(el.color || null);
    const borderHex = colorToHex(el.borderColor || null);
    const shadowHexes = extractHexFromBoxShadow(el.boxShadow || null);
    return {
      selector: el.selector,
      tagName: el.tagName,
      backgroundColor: el.backgroundColor || null,
      color: el.color || null,
      borderColor: el.borderColor || null,
      boxShadow: el.boxShadow || null,
      backgroundHex,
      colorHex,
      borderHex,
      shadowHexes,
    };
  });

  return { cssVariables, elements };
}

async function fetchManifest(
  pageUrl: string,
  href: string | null,
): Promise<ManifestColors> {
  const empty: ManifestColors = {
    url: null,
    themeColor: null,
    backgroundColor: null,
    themeColorHex: null,
    backgroundColorHex: null,
  };
  if (!href) return empty;

  try {
    const abs = new URL(href, pageUrl).toString();
    const res = await fetch(abs, {
      headers: { Accept: "application/manifest+json, application/json, */*" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ...empty, url: abs };
    const data = (await res.json()) as {
      theme_color?: string;
      background_color?: string;
    };
    const themeColor = data.theme_color?.trim() || null;
    const backgroundColor = data.background_color?.trim() || null;
    return {
      url: abs,
      themeColor,
      backgroundColor,
      themeColorHex: colorToHex(themeColor),
      backgroundColorHex: colorToHex(backgroundColor),
    };
  } catch {
    return { ...empty, url: href };
  }
}

async function runPass(
  page: Awaited<ReturnType<typeof createThemeBrowserSession>>["page"],
  scheme: ColorSchemePass,
  settleMs: number,
  assets: ThemeAssets,
): Promise<ThemePassResult> {
  await page.emulateMedia({ colorScheme: scheme });
  // Allow CSS media queries / JS theme listeners to apply
  await new Promise((r) => setTimeout(r, settleMs));
  try {
    await page.waitForLoadState("networkidle", { timeout: 8_000 });
  } catch {
    // ignore — some sites keep long-polling
  }

  const raw = await page.evaluate(collectThemePassInPage);
  const { cssVariables, elements } = normalizePass(raw);
  return categorizePass(scheme, cssVariables, elements, assets);
}

/**
 * Extract a full visual theme blueprint from a live URL using Playwright.
 * Two-pass: prefers-color-scheme light, then dark.
 */
export async function extractThemeBlueprint(
  inputUrl: string,
  options: ExtractThemeOptions = {},
): Promise<ThemeBlueprint> {
  const url = normalizeUrl(inputUrl);
  const timeoutMs = options.timeoutMs ?? 45_000;
  const settleMs = options.schemeSettleMs ?? 600;
  const viewport = options.viewport ?? DEFAULT_VIEWPORT;

  const session = await createThemeBrowserSession(options);
  const { page, close } = session;

  try {
    try {
      await navigateAndWait(page, url, timeoutMs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/timeout/i.test(msg)) {
        throw new ThemeExtractError(
          `Timed out loading ${url}`,
          "TIMEOUT",
        );
      }
      throw new ThemeExtractError(
        `Failed to navigate to ${url}: ${msg}`,
        "NAVIGATION",
      );
    }

    const assetsRaw = await page.evaluate(collectAssetsInPage);
    const manifest = await fetchManifest(url, assetsRaw.manifestHref);

    // Prefer manifest theme_color; fall back to meta theme-color
    if (!manifest.themeColorHex && assetsRaw.metaThemeColor) {
      manifest.themeColor = assetsRaw.metaThemeColor;
      manifest.themeColorHex = colorToHex(assetsRaw.metaThemeColor);
    }

    const faviconUrl =
      !assetsRaw.faviconUrl ||
      assetsRaw.faviconUrl === "data:," ||
      assetsRaw.faviconUrl.startsWith("data:,")
        ? null
        : assetsRaw.faviconUrl;

    const assets: ThemeAssets = {
      faviconUrl,
      logoUrl: assetsRaw.logoUrl,
      svgColors: [
        ...new Set(
          assetsRaw.svgColors
            .map((c) => colorToHex(c) || c.toUpperCase())
            .filter(Boolean),
        ),
      ],
      manifest,
    };

    const light = await runPass(page, "light", settleMs, assets);
    const dark = await runPass(page, "dark", settleMs, assets);
    const preferredScheme = pickPreferredScheme(light, dark);
    const palette = mergePalettes(light, dark, assets);

    return {
      url,
      extractedAt: new Date().toISOString(),
      viewport,
      assets,
      light,
      dark,
      preferredScheme,
      palette,
    };
  } finally {
    await close();
  }
}

/**
 * Safe wrapper — never throws; returns blueprint with `error` field on failure.
 */
export async function extractThemeBlueprintSafe(
  inputUrl: string,
  options: ExtractThemeOptions = {},
): Promise<ThemeBlueprint> {
  try {
    return await extractThemeBlueprint(inputUrl, options);
  } catch (err) {
    const message =
      err instanceof ThemeExtractError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);

    const emptyPass = (scheme: ColorSchemePass): ThemePassResult =>
      categorizePass(scheme, [], [], {
        faviconUrl: null,
        logoUrl: null,
        svgColors: [],
        manifest: {
          url: null,
          themeColor: null,
          backgroundColor: null,
          themeColorHex: null,
          backgroundColorHex: null,
        },
      });

    return {
      url: inputUrl,
      extractedAt: new Date().toISOString(),
      viewport: options.viewport ?? DEFAULT_VIEWPORT,
      assets: {
        faviconUrl: null,
        logoUrl: null,
        svgColors: [],
        manifest: {
          url: null,
          themeColor: null,
          backgroundColor: null,
          themeColorHex: null,
          backgroundColorHex: null,
        },
      },
      light: emptyPass("light"),
      dark: emptyPass("dark"),
      preferredScheme: "light",
      palette: [],
      error: message,
    };
  }
}

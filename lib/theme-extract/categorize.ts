import {
  colorToHex,
  luminance,
  saturation,
} from "./color-utils";
import type {
  ColorFrequency,
  CssVariableToken,
  ElementComputedColors,
  ThemeAssets,
  ThemeCategories,
  ThemePassResult,
  ColorSchemePass,
} from "./types";

type ColorHit = { hex: string; source: string };

function pushHit(hits: ColorHit[], hex: string | null, source: string) {
  if (!hex) return;
  hits.push({ hex, source });
}

function buildFrequencies(hits: ColorHit[]): ColorFrequency[] {
  const map = new Map<string, { count: number; sources: Set<string> }>();
  for (const h of hits) {
    const cur = map.get(h.hex) || { count: 0, sources: new Set<string>() };
    cur.count += 1;
    cur.sources.add(h.source);
    map.set(h.hex, cur);
  }
  return [...map.entries()]
    .map(([hex, v]) => ({
      hex,
      count: v.count,
      sources: [...v.sources].sort(),
    }))
    .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex));
}

function varCategory(name: string): keyof ThemeCategories | null {
  const n = name.toLowerCase();
  if (/(primary|brand|main)/.test(n)) return "primary";
  if (/(secondary)/.test(n)) return "secondary";
  if (/(accent|cta|link|action|highlight|focus)/.test(n)) return "accents";
  if (/(background|bg|page|canvas|body)/.test(n)) return "backgrounds";
  if (/(surface|card|panel|elevated|muted-bg|popover)/.test(n)) return "surfaces";
  if (/(foreground|fg|text|heading|title|content)/.test(n)) return "text";
  if (/(border|divider|stroke|outline|ring)/.test(n)) return "borders";
  if (/(shadow)/.test(n)) return "shadows";
  return null;
}

function emptyCategories(): ThemeCategories {
  return {
    primary: [],
    secondary: [],
    backgrounds: [],
    surfaces: [],
    text: [],
    borders: [],
    accents: [],
    shadows: [],
    other: [],
  };
}

function uniq(list: string[]): string[] {
  return [...new Set(list)];
}

export function categorizePass(
  colorScheme: ColorSchemePass,
  cssVariables: CssVariableToken[],
  elements: ElementComputedColors[],
  assets?: ThemeAssets,
): ThemePassResult {
  const hits: ColorHit[] = [];
  const cats = emptyCategories();

  for (const v of cssVariables) {
    if (!v.hex) continue;
    pushHit(hits, v.hex, `var:${v.name}`);
    const cat = varCategory(v.name);
    if (cat) cats[cat].push(v.hex);
    else cats.other.push(v.hex);
  }

  for (const el of elements) {
    pushHit(hits, el.backgroundHex, `${el.selector}:background`);
    pushHit(hits, el.colorHex, `${el.selector}:color`);
    pushHit(hits, el.borderHex, `${el.selector}:border`);
    for (const sh of el.shadowHexes) {
      pushHit(hits, sh, `${el.selector}:shadow`);
      cats.shadows.push(sh);
    }

    const tag = el.tagName.toLowerCase();
    if (el.backgroundHex) {
      if (
        tag === "body" ||
        tag === "main" ||
        tag === "html" ||
        el.selector === "html" ||
        el.selector === "body"
      ) {
        cats.backgrounds.push(el.backgroundHex);
      } else if (tag === "header" || tag === "footer" || tag === "nav") {
        cats.surfaces.push(el.backgroundHex);
      } else if (tag === "button") {
        cats.accents.push(el.backgroundHex);
      } else {
        cats.surfaces.push(el.backgroundHex);
      }
    }
    if (el.colorHex) {
      if (tag === "a" || tag === "button") cats.accents.push(el.colorHex);
      else cats.text.push(el.colorHex);
    }
    if (el.borderHex) cats.borders.push(el.borderHex);
  }

  if (assets) {
    pushHit(hits, assets.manifest.themeColorHex, "manifest:theme_color");
    pushHit(
      hits,
      assets.manifest.backgroundColorHex,
      "manifest:background_color",
    );
    for (const svg of assets.svgColors) {
      pushHit(hits, svg, "svg");
      cats.accents.push(svg);
    }
  }

  for (const key of Object.keys(cats) as (keyof ThemeCategories)[]) {
    cats[key] = uniq(cats[key]);
  }

  const frequencies = buildFrequencies(hits);
  const allColors = frequencies.map((f) => f.hex);
  const dominant = pickDominant(frequencies, elements, cats, colorScheme);

  return {
    colorScheme,
    cssVariables,
    elements,
    frequencies,
    categories: cats,
    dominant,
    allColors,
  };
}

function pickDominant(
  frequencies: ColorFrequency[],
  elements: ElementComputedColors[],
  cats: ThemeCategories,
  scheme: ColorSchemePass,
): ThemePassResult["dominant"] {
  const body = elements.find((e) => e.selector === "body");
  const main = elements.find((e) => e.selector === "main");
  const h1 = elements.find((e) => e.selector === "h1");
  const p = elements.find((e) => e.selector === "p");
  const button = elements.find((e) => e.selector === "button");
  const a = elements.find((e) => e.selector === "a");

  const background =
    body?.backgroundHex ||
    main?.backgroundHex ||
    cats.backgrounds[0] ||
    frequencies[0]?.hex ||
    null;

  const text =
    body?.colorHex ||
    h1?.colorHex ||
    p?.colorHex ||
    cats.text[0] ||
    null;

  const isDark =
    background != null
      ? luminance(background) < 0.45
      : scheme === "dark";

  const surfaceCandidates = [
    ...cats.surfaces,
    ...frequencies
      .map((f) => f.hex)
      .filter((hex) => {
        if (!background) return true;
        const d = Math.abs(luminance(hex) - luminance(background));
        return d > 0.02 && d < 0.35;
      }),
  ];
  const surface = surfaceCandidates[0] || background;

  const accentFromInteractive =
    button?.backgroundHex ||
    a?.colorHex ||
    cats.accents.find((c) => saturation(c) > 0.2) ||
    cats.primary[0] ||
    null;

  const accentFromSat = frequencies
    .map((f) => f.hex)
    .filter((hex) => {
      const sat = saturation(hex);
      const lum = luminance(hex);
      return sat > 0.25 && lum > 0.12 && lum < 0.88;
    })[0];

  const accent = accentFromInteractive || accentFromSat || null;

  const muted =
    cats.text.find((t) => t !== text && saturation(t) < 0.25) ||
    (isDark ? "#94A3B8" : "#64748B");

  const border =
    cats.borders[0] ||
    (isDark ? "#FFFFFF1A" : "#0000001A");

  // Normalize 8-digit border fallbacks to opaque approximations for Tailwind
  const borderHex =
    border.length === 9
      ? isDark
        ? "#334155"
        : "#E2E8F0"
      : border;

  return {
    background,
    surface: surface || null,
    text,
    muted: colorToHex(muted) || muted,
    accent,
    border: colorToHex(borderHex) || borderHex,
    isDark,
  };
}

export function mergePalettes(
  light: ThemePassResult,
  dark: ThemePassResult,
  assets: ThemeAssets,
): string[] {
  const all = [
    ...light.allColors,
    ...dark.allColors,
    ...assets.svgColors,
    assets.manifest.themeColorHex,
    assets.manifest.backgroundColorHex,
  ].filter((c): c is string => Boolean(c));
  return uniq(all);
}

/**
 * Prefer the scheme that actually differs / has more CSS variable activity,
 * defaulting to light unless dark clearly has distinct tokens or dark page bg.
 */
export function pickPreferredScheme(
  light: ThemePassResult,
  dark: ThemePassResult,
): ColorSchemePass {
  const lightVars = light.cssVariables.filter((v) => v.hex).length;
  const darkVars = dark.cssVariables.filter((v) => v.hex).length;
  const lightBg = light.dominant.background;
  const darkBg = dark.dominant.background;

  if (lightBg && darkBg && lightBg !== darkBg) {
    // Site responds to prefers-color-scheme — prefer light for clone default
    // unless the light pass looks empty / white-only while dark has rich tokens.
    if (darkVars > lightVars * 1.5 && dark.frequencies.length > light.frequencies.length) {
      return "dark";
    }
    return light.dominant.isDark ? "dark" : "light";
  }

  if (light.dominant.isDark && !dark.dominant.isDark) return "light";
  if (dark.dominant.isDark && light.dominant.isDark) return "dark";
  return light.dominant.isDark ? "dark" : "light";
}

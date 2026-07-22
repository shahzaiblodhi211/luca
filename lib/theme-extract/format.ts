import type { ThemeBlueprint, ThemePassResult } from "./types";

function list(colors: string[], limit = 12): string {
  if (!colors.length) return "(none)";
  return colors.slice(0, limit).join(", ");
}

function formatPass(label: string, pass: ThemePassResult): string[] {
  const d = pass.dominant;
  const topFreq = pass.frequencies
    .slice(0, 10)
    .map((f) => `${f.hex}×${f.count}`)
    .join(", ");

  return [
    `### ${label} (prefers-color-scheme: ${pass.colorScheme})`,
    `- Dominant background: ${d.background || "(unknown)"}`,
    `- Dominant surface: ${d.surface || "(unknown)"}`,
    `- Dominant text: ${d.text || "(unknown)"}`,
    `- Muted text: ${d.muted || "(unknown)"}`,
    `- Accent: ${d.accent || "(unknown)"}`,
    `- Border: ${d.border || "(unknown)"}`,
    `- isDark: ${d.isDark}`,
    `- Categories:`,
    `  - primary: ${list(pass.categories.primary)}`,
    `  - secondary: ${list(pass.categories.secondary)}`,
    `  - backgrounds: ${list(pass.categories.backgrounds)}`,
    `  - surfaces: ${list(pass.categories.surfaces)}`,
    `  - text: ${list(pass.categories.text)}`,
    `  - borders: ${list(pass.categories.borders)}`,
    `  - accents: ${list(pass.categories.accents)}`,
    `- Top frequencies: ${topFreq || "(none)"}`,
    `- CSS color variables (${pass.cssVariables.length}):`,
    ...(pass.cssVariables.length
      ? pass.cssVariables
          .slice(0, 40)
          .map((v) => `  - ${v.name}: ${v.hex} (raw: ${v.rawValue})`)
      : ["  - (none)"]),
    `- Computed elements:`,
    ...pass.elements.map(
      (el) =>
        `  - ${el.selector}: bg=${el.backgroundHex || "—"} text=${el.colorHex || "—"} border=${el.borderHex || "—"}`,
    ),
  ];
}

/**
 * Markdown block for the homepage clone brief / agent context.
 * When screenshotMood is set, that mood wins over prefers-color-scheme.
 */
export function formatThemeBlueprintForBrief(
  theme: ThemeBlueprint,
  screenshotMood?: "LIGHT" | "DARK",
): string {
  if (theme.error) {
    return [
      `## THEME ENGINE (Playwright)`,
      `Extraction failed: ${theme.error}`,
      `Fall back to SCREENSHOT palette + CSS scrape.`,
    ].join("\n");
  }

  const preferredScheme =
    screenshotMood === "LIGHT"
      ? "light"
      : screenshotMood === "DARK"
        ? "dark"
        : theme.preferredScheme;
  const preferred =
    preferredScheme === "dark" ? theme.dark : theme.light;
  const d = preferred.dominant;

  return [
    `## THEME ENGINE (supporting tokens — screenshot still wins for mood)`,
    `Source: ${theme.url}`,
    `Scheme used: ${preferredScheme.toUpperCase()}${screenshotMood ? ` (forced by screenshot = ${screenshotMood})` : ""}`,
    `Favicon: ${theme.assets.faviconUrl || "(none)"}`,
    `Logo candidate: ${theme.assets.logoUrl || "(none)"}`,
    `Manifest theme_color: ${theme.assets.manifest.themeColorHex || theme.assets.manifest.themeColor || "(none)"}`,
    `SVG brand colors: ${list(theme.assets.svgColors)}`,
    `Token palette: ${list(theme.palette, 24)}`,
    "",
    `### Supporting computed tokens (${preferredScheme})`,
    `- background: ${d.background || "—"}`,
    `- surface: ${d.surface || "—"}`,
    `- text: ${d.text || "—"}`,
    `- accent: ${d.accent || "—"}`,
    `- Do NOT switch to the other color-scheme pass if the screenshot mood differs.`,
    "",
    ...formatPass(
      preferredScheme === "dark" ? "Dark pass" : "Light pass",
      preferred,
    ),
  ].join("\n");
}

/** Compact JSON suitable for API responses (drops bulky element dumps if needed). */
export function themeBlueprintToJson(theme: ThemeBlueprint): ThemeBlueprint {
  return theme;
}

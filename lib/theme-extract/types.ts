/** Visual theme blueprint extracted from a live page via Playwright. */

export type ColorSchemePass = "light" | "dark";

export type CssVariableToken = {
  name: string;
  rawValue: string;
  resolved: string;
  hex: string | null;
  source: ":root" | "html";
};

export type ElementComputedColors = {
  selector: string;
  tagName: string;
  backgroundColor: string | null;
  color: string | null;
  borderColor: string | null;
  boxShadow: string | null;
  backgroundHex: string | null;
  colorHex: string | null;
  borderHex: string | null;
  shadowHexes: string[];
};

export type ManifestColors = {
  url: string | null;
  themeColor: string | null;
  backgroundColor: string | null;
  themeColorHex: string | null;
  backgroundColorHex: string | null;
};

export type ThemeAssets = {
  faviconUrl: string | null;
  logoUrl: string | null;
  svgColors: string[];
  manifest: ManifestColors;
};

export type ColorFrequency = {
  hex: string;
  count: number;
  sources: string[];
};

export type ThemeCategories = {
  primary: string[];
  secondary: string[];
  backgrounds: string[];
  surfaces: string[];
  text: string[];
  borders: string[];
  accents: string[];
  shadows: string[];
  other: string[];
};

export type ThemePassResult = {
  colorScheme: ColorSchemePass;
  cssVariables: CssVariableToken[];
  elements: ElementComputedColors[];
  frequencies: ColorFrequency[];
  categories: ThemeCategories;
  dominant: {
    background: string | null;
    surface: string | null;
    text: string | null;
    muted: string | null;
    accent: string | null;
    border: string | null;
    isDark: boolean;
  };
  allColors: string[];
};

export type ThemeBlueprint = {
  url: string;
  extractedAt: string;
  viewport: { width: number; height: number };
  assets: ThemeAssets;
  light: ThemePassResult;
  dark: ThemePassResult;
  /** Preferred pass for cloning (based on which scheme the site actually styles). */
  preferredScheme: ColorSchemePass;
  /** Flattened, deduped HEX palette across both passes + assets. */
  palette: string[];
  error?: string;
};

export type ExtractThemeOptions = {
  /** Navigation + network idle timeout (ms). Default 45000. */
  timeoutMs?: number;
  viewport?: { width: number; height: number };
  /** Extra wait after color-scheme change (ms). Default 600. */
  schemeSettleMs?: number;
  userAgent?: string;
};

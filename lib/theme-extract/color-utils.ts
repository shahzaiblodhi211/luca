/** Color parsing / normalization — Node-side (mirrors in-page helpers). */

const TRANSPARENT = new Set([
  "transparent",
  "rgba(0, 0, 0, 0)",
  "rgba(0,0,0,0)",
  "rgb(0, 0, 0, 0)",
  "hwb(0 0% 0% / 0)",
]);

export function isTransparentColor(value: string | null | undefined): boolean {
  if (!value) return true;
  const v = value.trim().toLowerCase();
  if (TRANSPARENT.has(v)) return true;
  const rgba = v.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/,
  );
  if (rgba && rgba[4] !== undefined && Number(rgba[4]) === 0) return true;
  const modern = v.match(
    /^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/,
  );
  if (modern && modern[4] !== undefined) {
    const a = modern[4].endsWith("%")
      ? Number(modern[4].slice(0, -1)) / 100
      : Number(modern[4]);
    if (a === 0) return true;
  }
  return false;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function toHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((x) => clampByte(x).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

function parseHexRaw(raw: string): string | null {
  const h = raw.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    return toHex(
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    );
  }
  if (/^[0-9a-fA-F]{6}$/.test(h)) {
    return toHex(
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    );
  }
  if (/^[0-9a-fA-F]{8}$/.test(h)) {
    const a = parseInt(h.slice(6, 8), 16) / 255;
    if (a === 0) return null;
    return toHex(
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    );
  }
  return null;
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360 / 360;
  const ss = Math.max(0, Math.min(1, s));
  const ll = Math.max(0, Math.min(1, l));
  if (ss === 0) {
    const g = ll * 255;
    return toHex(g, g, g);
  }
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  return toHex(
    hueToRgb(p, q, hh + 1 / 3) * 255,
    hueToRgb(p, q, hh) * 255,
    hueToRgb(p, q, hh - 1 / 3) * 255,
  );
}

/**
 * Convert any common CSS color string to uppercase `#RRGGBB`.
 * Returns null for transparent / unparseable values.
 */
export function colorToHex(input: string | null | undefined): string | null {
  if (!input || isTransparentColor(input)) return null;
  const raw = input.trim();

  if (raw.startsWith("#")) return parseHexRaw(raw);

  const rgb = raw.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i,
  );
  if (rgb) {
    if (rgb[4] !== undefined && Number(rgb[4]) === 0) return null;
    return toHex(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]));
  }

  const rgbSpace = raw.match(
    /^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/i,
  );
  if (rgbSpace) {
    if (rgbSpace[4] !== undefined) {
      const a = rgbSpace[4].endsWith("%")
        ? Number(rgbSpace[4].slice(0, -1)) / 100
        : Number(rgbSpace[4]);
      if (a === 0) return null;
    }
    return toHex(Number(rgbSpace[1]), Number(rgbSpace[2]), Number(rgbSpace[3]));
  }

  const hsl = raw.match(
    /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)$/i,
  );
  if (hsl) {
    if (hsl[4] !== undefined && Number(hsl[4]) === 0) return null;
    return hslToHex(Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100);
  }

  const hslSpace = raw.match(
    /^hsla?\(\s*([\d.]+)(?:deg)?\s+([\d.]+)%\s+([\d.]+)%\s*(?:\/\s*([\d.]+%?)\s*)?\)$/i,
  );
  if (hslSpace) {
    if (hslSpace[4] !== undefined) {
      const a = hslSpace[4].endsWith("%")
        ? Number(hslSpace[4].slice(0, -1)) / 100
        : Number(hslSpace[4]);
      if (a === 0) return null;
    }
    return hslToHex(
      Number(hslSpace[1]),
      Number(hslSpace[2]) / 100,
      Number(hslSpace[3]) / 100,
    );
  }

  // Named colors via canvas would need DOM; skip on Node.
  return null;
}

export function extractHexFromBoxShadow(shadow: string | null): string[] {
  if (!shadow || shadow === "none") return [];
  const found = shadow.match(
    /#(?:[0-9a-fA-F]{3,8})\b|rgba?\([^)]+\)|hsla?\([^)]+\)/gi,
  );
  if (!found) return [];
  const hexes: string[] = [];
  for (const f of found) {
    const hex = colorToHex(f);
    if (hex) hexes.push(hex);
  }
  return [...new Set(hexes)];
}

export function luminance(hex: string): number {
  const h = hex.replace("#", "");
  if (h.length !== 6) return 0;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function saturation(hex: string): number {
  const h = hex.replace("#", "");
  if (h.length !== 6) return 0;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

export function looksLikeColorValue(value: string): boolean {
  const v = value.trim();
  if (!v || v.startsWith("url(") || v.includes("gradient")) return false;
  if (v.startsWith("#")) return Boolean(parseHexRaw(v));
  if (/^(rgb|hsl)a?\(/i.test(v)) return true;
  // CSS vars that resolve later are handled via getComputedStyle in-page
  return false;
}

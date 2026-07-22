import sharp from "sharp";

export type ScreenshotPalette = {
  isDark: boolean;
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  border: string;
  /** Short human note for the brief */
  mood: "LIGHT" | "DARK";
};

function toHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((n) =>
        Math.max(0, Math.min(255, Math.round(n)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
      .toUpperCase()
  );
}

function lum(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function sat(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

/**
 * Sample the captured screenshot pixels so LOCKED colors match what the user sees,
 * not a wrong CSS-variable / dark-mode pass.
 */
export async function paletteFromScreenshot(
  base64: string,
): Promise<ScreenshotPalette | null> {
  try {
    const input = Buffer.from(base64, "base64");
    // Downsample for fast stats; focus on top hero band (mood lives there)
    const { data, info } = await sharp(input, { failOn: "none" })
      .rotate()
      .resize({ width: 160, height: 240, fit: "cover", position: "top" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w = info.width;
    const h = info.height;
    const channels = info.channels;
    const topH = Math.max(8, Math.floor(h * 0.35));

    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let n = 0;
    let lightR = 0;
    let lightG = 0;
    let lightB = 0;
    let lightN = 0;
    let darkR = 0;
    let darkG = 0;
    let darkB = 0;
    let darkN = 0;

    type SatHit = { r: number; g: number; b: number; s: number; l: number };
    const saturated: SatHit[] = [];

    for (let y = 0; y < topH; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * channels;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = channels > 3 ? data[i + 3] : 255;
        if (a < 200) continue;

        sumR += r;
        sumG += g;
        sumB += b;
        n++;

        const l = lum(r, g, b);
        if (l > 0.72) {
          lightR += r;
          lightG += g;
          lightB += b;
          lightN++;
        } else if (l < 0.28) {
          darkR += r;
          darkG += g;
          darkB += b;
          darkN++;
        }

        const s = sat(r, g, b);
        if (s > 0.28 && l > 0.12 && l < 0.85) {
          saturated.push({ r, g, b, s, l });
        }
      }
    }

    if (!n) return null;

    const avgL = lum(sumR / n, sumG / n, sumB / n);
    const isDark = avgL < 0.42;
    const mood: "LIGHT" | "DARK" = isDark ? "DARK" : "LIGHT";

    const background = isDark
      ? darkN
        ? toHex(darkR / darkN, darkG / darkN, darkB / darkN)
        : toHex(sumR / n, sumG / n, sumB / n)
      : lightN
        ? toHex(lightR / lightN, lightG / lightN, lightB / lightN)
        : toHex(sumR / n, sumG / n, sumB / n);

    // Surface: slightly off-background
    const bg = {
      r: parseInt(background.slice(1, 3), 16),
      g: parseInt(background.slice(3, 5), 16),
      b: parseInt(background.slice(5, 7), 16),
    };
    const surface = isDark
      ? toHex(bg.r + 18, bg.g + 18, bg.b + 22)
      : toHex(Math.min(255, bg.r - 8), Math.min(255, bg.g - 8), Math.min(255, bg.b - 8));

    const text = isDark
      ? lightN
        ? toHex(lightR / lightN, lightG / lightN, lightB / lightN)
        : "#F8FAFC"
      : darkN
        ? toHex(darkR / darkN, darkG / darkN, darkB / darkN)
        : "#111827";

    saturated.sort((a, b) => b.s - a.s);
    const accentHit = saturated[0];
    // Prefer green/teal brand accents when present (common on light sites)
    const greenish = saturated.find(
      (c) => c.g > c.r && c.g > c.b && c.s > 0.25,
    );
    const accent = greenish
      ? toHex(greenish.r, greenish.g, greenish.b)
      : accentHit
        ? toHex(accentHit.r, accentHit.g, accentHit.b)
        : isDark
          ? "#3B82F6"
          : "#0F766E";

    return {
      isDark,
      mood,
      background,
      surface,
      text,
      muted: isDark ? "#94A3B8" : "#6B7280",
      accent,
      border: isDark ? "#334155" : "#E5E7EB",
    };
  } catch (err) {
    console.warn("[screenshot-palette] failed", err);
    return null;
  }
}

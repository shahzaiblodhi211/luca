const GOOGLE_FONTS: Record<string, string> = {
  inter: "Inter",
  "playfair display": "Playfair_Display",
  playfair: "Playfair_Display",
  "cormorant garamond": "Cormorant_Garamond",
  cormorant: "Cormorant_Garamond",
  "dm sans": "DM_Sans",
  "dm serif display": "DM_Serif_Display",
  manrope: "Manrope",
  outfit: "Outfit",
  "libre baskerville": "Libre_Baskerville",
  "source serif 4": "Source_Serif_4",
  "source serif": "Source_Serif_4",
  "instrument serif": "Instrument_Serif",
  "instrument sans": "Instrument_Sans",
  newsreader: "Newsreader",
  fraunces: "Fraunces",
  syne: "Syne",
  "space grotesk": "Space_Grotesk",
  "ibm plex sans": "IBM_Plex_Sans",
  "ibm plex serif": "IBM_Plex_Serif",
  "plus jakarta sans": "Plus_Jakarta_Sans",
  "eb garamond": "EB_Garamond",
  "libre franklin": "Libre_Franklin",
  "work sans": "Work_Sans",
  jost: "Jost",
  archivo: "Archivo",
  "bodoni moda": "Bodoni_Moda",
  cinzel: "Cinzel",
  "pt serif": "PT_Serif",
  "noto serif jp": "Noto_Serif_JP",
  "noto sans jp": "Noto_Sans_JP",
  "noto serif": "Noto_Serif_JP",
  "noto sans": "Noto_Sans_JP",
  "hina mincho": "Hina_Mincho",
  "shippori mincho": "Shippori_Mincho",
  "zen old mincho": "Zen_Old_Mincho",
  "zen kaku gothic new": "Zen_Kaku_Gothic_New",
  "sawarabi mincho": "Sawarabi_Mincho",
  "sawarabi gothic": "Sawarabi_Gothic",
  "kiwi maru": "Kiwi_Maru",
  "m plus 1p": "M_PLUS_1p",
  "kosugi maru": "Kosugi_Maru",
};

export function fontVarName(importName: string): string {
  return `--font-${importName.toLowerCase()}`;
}

export function isSansFamily(family?: string): boolean {
  return /gothic|sans|grotesk|helvetica|arial|yu gothic|hiragino sans|kaku gothic|ゴシック|meiryo|osaka/.test(
    (family || "").toLowerCase(),
  );
}

export function resolveGoogleFont(family: string): string | null {
  const key = family.toLowerCase().replace(/\s+/g, " ").trim();
  if (!key) return null;
  if (GOOGLE_FONTS[key]) return GOOGLE_FONTS[key];
  for (const [k, v] of Object.entries(GOOGLE_FONTS)) {
    if (key === k || key.startsWith(`${k} `)) return v;
  }
  return null;
}

function systemFallbacks(family: string): string[] {
  const key = family.toLowerCase();
  if (/mincho|明朝|ryumin|tsukum|游明朝|yuminc/.test(key)) {
    return [
      `"YuMincho"`,
      `"Yu Mincho"`,
      `"Hiragino Mincho ProN"`,
      `"Hiragino Mincho Pro"`,
      `"MS PMincho"`,
    ];
  }
  if (/gothic|ゴシック|yu gothic|hiragino|kaku|meiryo|osaka|游ゴシック/.test(key)) {
    return [
      `"YuGothic"`,
      `"Yu Gothic"`,
      `"Hiragino Sans"`,
      `"Hiragino Kaku Gothic ProN"`,
      `"Meiryo"`,
    ];
  }
  if (/didot|bodoni|playfair|garamond|baskerville|caslon|times/.test(key)) {
    return [`Georgia`, `"Times New Roman"`];
  }
  return [];
}

export function fontStack(family: string | undefined, _japanese: boolean): string {
  const raw = (family || "").trim();
  const sans = isSansFamily(raw);
  if (!raw) {
    return sans
      ? `"Hiragino Sans", "YuGothic", "Yu Gothic", sans-serif`
      : `"YuMincho", "Yu Mincho", "Hiragino Mincho ProN", serif`;
  }
  const parts = [`"${raw}"`];
  const spaced = raw.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (spaced !== raw) parts.push(`"${spaced}"`);
  parts.push(...systemFallbacks(raw));
  const google = resolveGoogleFont(raw);
  if (google) {
    const pretty = google.replace(/_/g, " ");
    parts.push(`"${pretty}"`);
    parts.push(`var(${fontVarName(google)})`);
  }
  parts.push(sans ? "sans-serif" : "serif");
  return [...new Set(parts)].join(", ");
}

export function fontNeedsWeight(importName: string): boolean {
  return /Noto_|Shippori|Zen_|Hina_|Libre_Baskerville|Cormorant|EB_Garamond|PT_Serif|Cinzel|Sawarabi|Kiwi_|M_PLUS|Kosugi/.test(
    importName,
  );
}

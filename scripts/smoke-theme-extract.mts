import { extractThemeBlueprint } from "../lib/theme-extract/index.ts";

const url = process.argv[2] || "https://example.com";
const t = await extractThemeBlueprint(url);
console.log(
  JSON.stringify(
    {
      url: t.url,
      preferred: t.preferredScheme,
      lightDom: t.light.dominant,
      darkDom: t.dark.dominant,
      palette: t.palette,
      vars: t.light.cssVariables.slice(0, 8),
      elements: t.light.elements,
      assets: t.assets,
      error: t.error,
    },
    null,
    2,
  ),
);

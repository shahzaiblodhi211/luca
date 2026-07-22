import { captureSiteScreenshot } from "../lib/site-screenshot.ts";

const s = await captureSiteScreenshot("https://www.avenbusiness.com/");
console.log(
  s
    ? {
        provider: s.provider,
        w: s.width,
        h: s.height,
        len: s.base64.length,
      }
    : null,
);

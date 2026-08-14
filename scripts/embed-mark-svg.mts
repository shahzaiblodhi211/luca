import { readFileSync, writeFileSync, statSync } from "fs";
import { join } from "path";

const pngPath = join(process.cwd(), "public", "brand", "luca-mark.png");
const svgPath = join(process.cwd(), "public", "brand", "luca-mark.svg");
const b = readFileSync(pngPath).toString("base64");
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" role="img" aria-label="Luca">
  <image width="512" height="512" xlink:href="data:image/png;base64,${b}"/>
</svg>
`;
writeFileSync(svgPath, svg);
console.log("wrote", svgPath, statSync(svgPath).size, "bytes");

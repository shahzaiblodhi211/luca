import { join } from "path";
import { writeFile } from "fs/promises";

const ROOT = process.cwd();
const SRC = join(ROOT, "public", "brand", "luca-mark.png");
const BG = { r: 9, g: 9, b: 11, alpha: 1 }; // zinc-950

async function renderSquareIcon(size: number): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const padding = Math.round(size * 0.14);
  const inner = size - padding * 2;

  const mark = await sharp(SRC)
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG,
    },
  })
    .composite([{ input: mark, gravity: "center" }])
    .png()
    .toBuffer();
}

async function writeIco(pngBuffers: Buffer[]): Promise<Buffer> {
  // Minimal ICO writer (PNG-compressed entries — supported by modern browsers).
  const images = pngBuffers.map((buf) => {
    const meta = { width: 0, height: 0 };
    // PNG IHDR is at bytes 16–23 (big-endian width/height).
    meta.width = buf.readUInt32BE(16);
    meta.height = buf.readUInt32BE(20);
    return { buf, width: meta.width, height: meta.height };
  });

  const count = images.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = dirEntrySize * count;
  let offset = headerSize + dirSize;
  const parts: Buffer[] = [];

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  parts.push(header);

  for (const img of images) {
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(img.width >= 256 ? 0 : img.width, 0);
    entry.writeUInt8(img.height >= 256 ? 0 : img.height, 1);
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit count
    entry.writeUInt32LE(img.buf.length, 8);
    entry.writeUInt32LE(offset, 12);
    parts.push(entry);
    offset += img.buf.length;
  }

  for (const img of images) parts.push(img.buf);
  return Buffer.concat(parts);
}

async function main() {
  const icon32 = await renderSquareIcon(32);
  const icon180 = await renderSquareIcon(180);
  const icon16 = await renderSquareIcon(16);
  const icon48 = await renderSquareIcon(48);

  const appDir = join(ROOT, "app");
  await writeFile(join(appDir, "icon.png"), icon32);
  await writeFile(join(appDir, "apple-icon.png"), icon180);
  await writeFile(join(appDir, "favicon.ico"), await writeIco([icon16, icon32, icon48]));

  console.log("wrote app/icon.png, app/apple-icon.png, app/favicon.ico");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

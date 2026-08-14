import { join } from "path";

async function main() {
  const sharp = (await import("sharp")).default;
  const src = join(process.cwd(), "public", "brand", "luca-mark.png");
  const out = join(process.cwd(), "public", "brand", "luca-mark-email.png");

  // White mark on black → solid black mark on white (clean edges for email clients).
  await sharp(src)
    .flatten({ background: "#000000" })
    .greyscale()
    .threshold(140)
    .negate()
    .png()
    .toFile(out);

  console.log("wrote", out);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

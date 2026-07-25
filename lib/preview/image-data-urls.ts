/** Replace static asset path strings in source with data URLs (preview / sandpack). */
export function applyImageDataUrlsToCode(
  code: string,
  imageDataUrls: Record<string, string>,
): string {
  if (!imageDataUrls || !Object.keys(imageDataUrls).length) return code;
  let next = code;
  for (const [assetPath, dataUrl] of Object.entries(imageDataUrls)) {
    if (!dataUrl || dataUrl.startsWith("http")) continue;
    const variants = [
      assetPath,
      assetPath.replace(/^\//, ""),
      assetPath.startsWith("/") ? assetPath : `/${assetPath}`,
      assetPath.replace(/^public\//, "/"),
      assetPath.startsWith("public/") ? `/${assetPath.slice("public/".length)}` : assetPath,
    ];
    for (const variant of [...new Set(variants)]) {
      if (!variant || variant.startsWith("data:")) continue;
      next = next.split(`"${variant}"`).join(`"${dataUrl}"`);
      next = next.split(`'${variant}'`).join(`'${dataUrl}'`);
      next = next.split(`\`${variant}\``).join(`\`${dataUrl}\``);
    }
  }
  return next;
}

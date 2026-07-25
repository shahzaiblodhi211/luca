/** Loopback URL for health checks from the host machine. */
export function previewInternalOrigin(port: number): string {
  return `http://127.0.0.1:${port}`;
}

/**
 * URL the browser iframe loads. Set PREVIEW_PUBLIC_ORIGIN=https://lucaai.app
 * and run the preview worker proxy at /_preview/:port (see services/preview-worker).
 */
export function previewPublicOrigin(port: number): string {
  const raw = process.env.PREVIEW_PUBLIC_ORIGIN?.trim();
  if (!raw) return previewInternalOrigin(port);
  const origin = raw.replace(/\/+$/, "");
  const prefix = (
    process.env.PREVIEW_PUBLIC_PATH_PREFIX ?? "/_preview"
  ).replace(/\/+$/, "");
  return `${origin}${prefix}/${port}`;
}

export function withPublicPreviewUrl<T extends { port: number; url: string }>(
  info: T,
): T {
  return { ...info, url: previewPublicOrigin(info.port) };
}

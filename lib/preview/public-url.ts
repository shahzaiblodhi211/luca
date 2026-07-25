/** Loopback URL for health checks from the host machine. */
export function previewInternalOrigin(port: number): string {
  return `http://127.0.0.1:${port}`;
}

/**
 * URL the browser iframe loads. Set PREVIEW_PUBLIC_ORIGIN=https://lucaai.app
 * and run the preview worker proxy at /_preview/:port (see services/preview-worker).
 */
export function previewPublicOrigin(port: number): string {
  const base = previewBasePathForPort(port);
  if (!base) return previewInternalOrigin(port);
  const raw = process.env.PREVIEW_PUBLIC_ORIGIN!.trim();
  const origin = raw.replace(/\/+$/, "");
  return `${origin}${base}/`;
}

/** Path prefix for Next `basePath` when iframe uses public preview URL (e.g. /_preview/4103). */
export function previewBasePathForPort(port: number): string | null {
  const raw = process.env.PREVIEW_PUBLIC_ORIGIN?.trim();
  if (!raw) return null;
  const prefix = (
    process.env.PREVIEW_PUBLIC_PATH_PREFIX ?? "/_preview"
  ).replace(/\/+$/, "");
  return `${prefix}/${port}`;
}

export function withPublicPreviewUrl<T extends { port: number; url: string }>(
  info: T,
): T {
  return { ...info, url: previewPublicOrigin(info.port) };
}

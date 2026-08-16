export type PreviewUrlPayload = {
  url?: string;
  port?: number;
  chatId?: string;
  previewOrigin?: string | null;
  previewBasePath?: string | null;
};

function clientPreviewOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_PREVIEW_ORIGIN?.trim() ||
    process.env.NEXT_PUBLIC_PREVIEW_WORKER_URL?.trim() ||
    ""
  ).replace(/\/+$/, "");
}

function extractChatBasePath(
  payload: PreviewUrlPayload,
  raw: string,
): string | null {
  if (payload.previewBasePath?.trim()) {
    return payload.previewBasePath.replace(/\/+$/, "");
  }
  const fromUrl = raw.match(/\/(_preview|p)\/([a-zA-Z0-9_-]{1,64})/);
  if (fromUrl?.[1] && fromUrl[2]) return `/${fromUrl[1]}/${fromUrl[2]}`;
  if (payload.chatId) return `/p/${payload.chatId}`;
  return null;
}

/** Turn worker API URL into a browser-loadable iframe origin (never loopback). */
export function resolvePreviewIframeBase(
  payload: PreviewUrlPayload,
): string | null {
  const raw = payload.url?.trim();
  if (!raw) return null;

  const publicOrigin =
    payload.previewOrigin?.replace(/\/+$/, "") || clientPreviewOrigin();
  const basePath = extractChatBasePath(payload, raw);

  if (publicOrigin && basePath) {
    return `${publicOrigin}${basePath}/`;
  }

  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(raw)) {
    return raw.endsWith("/") ? raw : `${raw}/`;
  }

  return raw.endsWith("/") ? raw : `${raw}/`;
}

/** Human-readable URL in the preview chrome (domain + path + route). */
export function formatPreviewDisplayUrl(
  iframeBase: string,
  routePath: string,
): string {
  const base = iframeBase.replace(/\/+$/, "");
  const route = routePath === "/" ? "" : routePath;
  try {
    const u = new URL(base);
    return `${u.host}${u.pathname.replace(/\/$/, "")}${route}`;
  } catch {
    return `${base.replace(/^https?:\/\//, "")}${route}`;
  }
}

export function previewUrlForRoute(iframeBase: string, routePath: string): string {
  const base = iframeBase.replace(/\/+$/, "");
  if (routePath === "/") return `${base}/`;
  return `${base}${routePath.startsWith("/") ? routePath : `/${routePath}`}`;
}

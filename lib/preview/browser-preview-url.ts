export type PreviewUrlPayload = {
  url?: string;
  port?: number;
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

function pathPrefix(): string {
  return (
    process.env.NEXT_PUBLIC_PREVIEW_PATH_PREFIX?.trim() || "/_preview"
  ).replace(/\/+$/, "");
}

function extractPort(payload: PreviewUrlPayload, raw: string): number | null {
  if (payload.port && payload.port >= 4100 && payload.port <= 4199) {
    return payload.port;
  }
  const fromPath = raw.match(/\/_preview\/(\d{4})/);
  if (fromPath) return Number.parseInt(fromPath[1]!, 10);
  const fromHost = raw.match(/:(\d{4})\/?$/);
  if (fromHost) return Number.parseInt(fromHost[1]!, 10);
  return null;
}

/** Turn worker API URL into a browser-loadable iframe origin (never loopback). */
export function resolvePreviewIframeBase(
  payload: PreviewUrlPayload,
): string | null {
  const raw = payload.url?.trim();
  if (!raw) return null;

  const port = extractPort(payload, raw);
  const publicOrigin =
    payload.previewOrigin?.replace(/\/+$/, "") || clientPreviewOrigin();
  const basePath =
    payload.previewBasePath?.replace(/\/+$/, "") ||
    (port != null ? `${pathPrefix()}/${port}` : null);

  if (publicOrigin && basePath) {
    return `${publicOrigin}${basePath}/`;
  }

  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(raw)) {
    return null;
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

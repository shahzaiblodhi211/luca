import { sanitizeChatId } from "./paths";

/** Loopback URL for health checks from the host machine. */
export function previewInternalOrigin(port: number): string {
  return `http://127.0.0.1:${port}`;
}

export function previewPathPrefix(): string {
  const raw = (
    process.env.PREVIEW_PUBLIC_PATH_PREFIX ?? "/p"
  ).trim();
  const prefix = raw.replace(/\/+$/, "");
  return prefix.startsWith("/") ? prefix : `/${prefix}`;
}

/** Public URL prefixes we accept (env + legacy `/_preview`). */
export function previewPathAliases(): string[] {
  const aliases = new Set(["/p", "/_preview", previewPathPrefix()]);
  return [...aliases];
}

export function matchPublicPreviewPath(pathname: string): {
  chatId: string;
  prefix: string;
  rest: string;
} | null {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  for (const prefix of previewPathAliases()) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = path.match(
      new RegExp(`^${escaped}/([a-zA-Z0-9_-]{1,64})(/.*)?$`),
    );
    if (m?.[1]) {
      return {
        chatId: m[1],
        prefix,
        rest: m[2] || "/",
      };
    }
  }
  return null;
}

/** Map an incoming public path onto the Next `basePath` this process was started with. */
export function rewritePreviewUpstreamPath(
  pathname: string,
  chatId: string,
): string {
  const matched = matchPublicPreviewPath(pathname);
  const canonical = previewBasePathForChat(chatId);
  const rest = matched?.rest || "/";
  if (!canonical) return rest.startsWith("/") ? rest : `/${rest}`;
  if (rest === "/") return `${canonical}/`;
  return `${canonical}${rest}`;
}

export function previewPublicOriginHost(): string | null {
  const raw = process.env.PREVIEW_PUBLIC_ORIGIN?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

/** Path prefix for Next `basePath` — stable per chat, not per port. */
export function previewBasePathForChat(chatId: string): string | null {
  if (!previewPublicOriginHost()) return null;
  return `${previewPathPrefix()}/${sanitizeChatId(chatId)}`;
}

/** @deprecated Use previewBasePathForChat — port URLs are no longer public. */
export function previewBasePathForPort(port: number): string | null {
  void port;
  return null;
}

export function previewPublicUrl(chatId: string, port: number): string {
  const base = previewBasePathForChat(chatId);
  if (!base) return `${previewInternalOrigin(port)}/`;
  return `${previewPublicOriginHost()}${base}/`;
}

/** Health-check URL on loopback (includes chat basePath when proxied). */
export function previewReadyCheckUrl(port: number, chatId?: string): string {
  const base = chatId ? previewBasePathForChat(chatId) : null;
  if (base) return `${previewInternalOrigin(port)}${base}/`;
  return `${previewInternalOrigin(port)}/`;
}

export function withPublicPreviewUrl<
  T extends { chatId: string; port: number; url: string },
>(
  info: T,
): T & {
  previewOrigin: string | null;
  previewBasePath: string | null;
} {
  const previewBasePath = previewBasePathForChat(info.chatId);
  return {
    ...info,
    url: previewPublicUrl(info.chatId, info.port),
    previewOrigin: previewPublicOriginHost(),
    previewBasePath,
  };
}

/** Stable public URL even when the preview process is asleep. */
export function idlePublicPreviewPayload(chatId: string) {
  const previewBasePath = previewBasePathForChat(chatId);
  const previewOrigin = previewPublicOriginHost();
  if (!previewBasePath || !previewOrigin) {
    return { status: "idle" as const };
  }
  return {
    status: "idle" as const,
    chatId: sanitizeChatId(chatId),
    url: `${previewOrigin}${previewBasePath}/`,
    previewOrigin,
    previewBasePath,
  };
}

const ALLOWED_AVATAR_HOSTS = [
  "lh3.googleusercontent.com",
  "avatars.githubusercontent.com",
] as const;

/** HTTPS avatar URLs from known OAuth CDNs only. */
export function normalizeOAuthAvatarUrl(
  url: string | undefined | null,
): string | undefined {
  const raw = String(url ?? "").trim();
  if (!raw.startsWith("https://")) return undefined;
  try {
    const { hostname } = new URL(raw);
    const ok =
      ALLOWED_AVATAR_HOSTS.some((h) => h === hostname) ||
      hostname.endsWith(".googleusercontent.com");
    return ok ? raw : undefined;
  } catch {
    return undefined;
  }
}

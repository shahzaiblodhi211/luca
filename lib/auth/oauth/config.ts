import type { OAuthProvider } from "../types";
import { appBaseUrl } from "../app-url";

export type OAuthMode = "login" | "signup";

export function oauthRedirectUri(provider: OAuthProvider): string {
  return `${appBaseUrl()}/api/auth/oauth/${provider}/callback`;
}

export function isOAuthProviderConfigured(provider: OAuthProvider): boolean {
  switch (provider) {
    case "google":
      return Boolean(
        process.env.GOOGLE_CLIENT_ID?.trim() &&
          process.env.GOOGLE_CLIENT_SECRET?.trim(),
      );
    case "github":
      return Boolean(
        process.env.GITHUB_CLIENT_ID?.trim() &&
          process.env.GITHUB_CLIENT_SECRET?.trim(),
      );
    case "apple":
      return Boolean(
        process.env.APPLE_CLIENT_ID?.trim() &&
          process.env.APPLE_TEAM_ID?.trim() &&
          process.env.APPLE_KEY_ID?.trim() &&
          process.env.APPLE_PRIVATE_KEY?.trim(),
      );
    default:
      return false;
  }
}

export function configuredOAuthProviders(): OAuthProvider[] {
  return (["google", "github", "apple"] as const).filter((p) =>
    isOAuthProviderConfigured(p),
  );
}

export function oauthProviderLabel(provider: OAuthProvider): string {
  switch (provider) {
    case "google":
      return "Google";
    case "github":
      return "GitHub";
    case "apple":
      return "Apple";
    default: {
      const _exhaustive: never = provider;
      return String(_exhaustive);
    }
  }
}

export function oauthErrorRedirect(code: string, detail?: string): string {
  const base = appBaseUrl().replace(/\/$/, "");
  const q = new URLSearchParams({ oauth_error: code });
  if (detail) q.set("oauth_error_detail", detail.slice(0, 200));
  return `${base}/?auth=login&${q.toString()}`;
}

export function oauthSuccessRedirect(): string {
  return `${appBaseUrl().replace(/\/$/, "")}/?oauth=success`;
}

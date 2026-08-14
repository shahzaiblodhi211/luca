import { appBaseUrl } from "@/lib/auth/app-url";

const DEFAULT_EMAIL_ASSET_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

/** Public origin for email images (must be HTTPS; Gmail blocks data URIs). */
export function emailAssetOrigin(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  let base = (fromEnv || appBaseUrl() || DEFAULT_EMAIL_ASSET_ORIGIN).replace(
    /\/$/,
    "",
  );
  if (/localhost|127\.0\.0\.1|^http:\/\//i.test(base)) {
    base = DEFAULT_EMAIL_ASSET_ORIGIN;
  }
  if (!base.startsWith("https://")) {
    base = DEFAULT_EMAIL_ASSET_ORIGIN;
  }
  return base;
}

export function emailLogoUrl(): string {
  return `${emailAssetOrigin()}/brand/luca-mark-email.png`;
}

export function emailLogoImgHtml(): string {
  const src = emailLogoUrl();
  return `<img src="${src}" width="52" height="52" alt="Luca Team" style="display:block;border:0;outline:none;text-decoration:none;width:52px;height:auto;max-width:52px;" />`;
}

import { Checkout } from "@polar-sh/nextjs";
import { appBaseUrl } from "@/lib/auth/app-url";
import { polarAccessToken, polarServer } from "@/lib/polar/config";

export const runtime = "nodejs";

const base = appBaseUrl().replace(/\/$/, "");

export const GET = Checkout({
  accessToken: polarAccessToken(),
  successUrl: `${base}/billing?checkout=success`,
  returnUrl: `${base}/billing`,
  server: polarServer(),
  theme: "dark",
});

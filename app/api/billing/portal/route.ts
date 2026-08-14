import { NextRequest, NextResponse } from "next/server";
import { CustomerPortal } from "@polar-sh/nextjs";
import { getSessionUser } from "@/lib/auth";
import { appBaseUrl } from "@/lib/auth/app-url";
import { findUserById } from "@/lib/auth/users";
import { polarAccessToken, polarConfigured, polarServer } from "@/lib/polar/config";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  const base = appBaseUrl().replace(/\/$/, "");

  if (!user) {
    return NextResponse.redirect(`${base}/?auth=login&return=/billing`);
  }

  if (!polarConfigured()) {
    return NextResponse.redirect(`${base}/billing?error=polar_not_configured`);
  }

  const doc = await findUserById(user.id);
  const portal = CustomerPortal({
    accessToken: polarAccessToken()!,
    server: polarServer(),
    returnUrl: `${base}/billing`,
    ...(doc?.polarCustomerId
      ? {
          getCustomerId: async () => doc.polarCustomerId!,
        }
      : {
          getExternalCustomerId: async () => user.id,
        }),
  });

  return portal(req);
}

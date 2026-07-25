"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuthModal, type AuthMode } from "./auth-context";

/** Opens the auth modal when `?auth=login|signup` is present, then cleans the URL. */
export function AuthQueryOpener() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { openAuth } = useAuthModal();

  useEffect(() => {
    const raw = params.get("auth");
    if (raw !== "login" && raw !== "signup" && raw !== "forgot") return;
    openAuth(raw as AuthMode);
    router.replace(pathname || "/", { scroll: false });
  }, [params, openAuth, router, pathname]);

  return null;
}

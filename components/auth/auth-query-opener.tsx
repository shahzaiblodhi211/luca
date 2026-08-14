"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuthModal, type AuthMode } from "./auth-context";
import { useAuthToast } from "./auth-toast";

/** Opens auth modal from query params; handles OAuth return redirects. */
export function AuthQueryOpener() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { openAuth, refreshUser, closeAuth } = useAuthModal();
  const { showToast } = useAuthToast();

  useEffect(() => {
    const oauthOk = params.get("oauth");
    if (oauthOk === "success") {
      void refreshUser().then(() => closeAuth());
      showToast({ type: "success", message: "Signed in successfully." });
      router.replace(pathname || "/", { scroll: false });
      return;
    }

    const oauthError = params.get("oauth_error");
    if (oauthError) {
      const detail = params.get("oauth_error_detail");
      openAuth("login");
      const messages: Record<string, string> = {
        not_configured:
          detail ||
          "This sign-in provider is not configured yet. Use email or add OAuth env vars.",
        oauth_failed: detail || "Sign-in failed. Try again or use email.",
        invalid_state: "Sign-in session expired. Try again.",
        provider_denied: detail || "Sign-in was cancelled.",
        missing_code: "Sign-in did not complete. Try again.",
        unknown_provider: "Unknown sign-in provider.",
        start_failed: "Could not start sign-in. Try again.",
        invalid_method: "Invalid sign-in request.",
      };
      showToast({
        type: "error",
        message: messages[oauthError] || detail || "Sign-in failed.",
      });
      router.replace(pathname || "/", { scroll: false });
      return;
    }

    const raw = params.get("auth");
    const ret = params.get("return");
    if (raw === "login" || raw === "signup" || raw === "forgot") {
      openAuth(raw as AuthMode);
      const dest =
        ret && (ret.startsWith("/billing") || ret.startsWith("/checkout"))
          ? ret
          : pathname || "/";
      router.replace(dest, { scroll: false });
      return;
    }

    if (ret?.startsWith("/billing") || ret?.startsWith("/checkout")) {
      router.replace(ret, { scroll: false });
    }
  }, [params, openAuth, router, pathname, refreshUser, closeAuth, showToast]);

  return null;
}

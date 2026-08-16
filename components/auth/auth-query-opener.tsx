"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { openVercelConnectModal } from "@/components/preview/vercel-connect-modal";
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

    const figmaOk = params.get("figma");
    if (figmaOk === "connected") {
      void refreshUser();
      showToast({
        type: "success",
        message: "Figma connected. Paste the file link again.",
      });
      const next = new URLSearchParams(params.toString());
      next.delete("figma");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname || "/", {
        scroll: false,
      });
      return;
    }

    const vercelOk = params.get("vercel");
    if (vercelOk === "connected") {
      void refreshUser();
      showToast({
        type: "success",
        message: "Vercel connected. You can publish now.",
      });
      const next = new URLSearchParams(params.toString());
      next.delete("vercel");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname || "/", {
        scroll: false,
      });
      return;
    }

    const vercelError = params.get("vercel_error");
    if (vercelError) {
      const messages: Record<string, string> = {
        not_configured:
          "Vercel OAuth is not set up. Paste a personal token instead.",
        not_signed_in: "Sign in first, then connect Vercel.",
        denied: "Vercel access was cancelled.",
        missing_code: "Vercel connect did not complete. Try again.",
        oauth_failed: "Could not connect Vercel. Try again or paste a token.",
      };
      showToast({
        type: "error",
        message: messages[vercelError] || "Could not connect Vercel.",
      });
      if (vercelError === "not_configured") {
        openVercelConnectModal();
      }
      const next = new URLSearchParams(params.toString());
      next.delete("vercel_error");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname || "/", {
        scroll: false,
      });
      return;
    }

    const figmaError = params.get("figma_error");
    if (figmaError) {
      const messages: Record<string, string> = {
        not_configured: "Figma connect is not set up on the server yet.",
        plan_required: "Figma import is on Plus and Pro. Upgrade to connect.",
        not_signed_in: "Sign in first, then connect Figma.",
        denied: "Figma access was cancelled.",
        missing_code: "Figma connect did not complete. Try again.",
        oauth_failed: "Could not connect Figma. Try again.",
      };
      showToast({
        type: "error",
        message: messages[figmaError] || "Could not connect Figma.",
      });
      const next = new URLSearchParams(params.toString());
      next.delete("figma_error");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname || "/", {
        scroll: false,
      });
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

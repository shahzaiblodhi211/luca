"use client";

import { usePathname } from "next/navigation";
import { useAuthModal } from "@/components/auth/auth-context";
import { cn } from "@/lib/utils";

export function figmaConnectUrl(returnTo: string) {
  const path = returnTo.startsWith("/") ? returnTo : "/";
  return `/api/integrations/figma/connect?return=${encodeURIComponent(path)}`;
}

export function FigmaConnectButton({
  className,
  label,
}: {
  className?: string;
  label?: string;
}) {
  const pathname = usePathname() || "/";
  const { user, billing, figmaOAuthConfigured, openAuth } = useAuthModal();
  const connected = Boolean(user?.figmaConnected);
  const figmaEnabled = Boolean(billing?.figmaEnabled);

  if (!figmaOAuthConfigured) return null;

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => openAuth("login")}
        className={cn(
          "text-[13px] text-zinc-300 transition-colors hover:text-white",
          className,
        )}
      >
        {label || "Connect Figma"}
      </button>
    );
  }

  if (connected) {
    return (
      <span className={cn("text-[13px] text-zinc-400", className)}>
        Figma · {user.figmaHandle || "connected"}
      </span>
    );
  }

  if (!figmaEnabled) {
    return (
      <a
        href="/billing"
        className={cn(
          "text-[13px] text-zinc-300 transition-colors hover:text-white",
          className,
        )}
      >
        {label || "Figma on Plus"}
      </a>
    );
  }

  return (
    <a
      href={figmaConnectUrl(pathname)}
      className={cn(
        "text-[13px] text-zinc-300 transition-colors hover:text-white",
        className,
      )}
    >
      {label || "Connect Figma"}
    </a>
  );
}

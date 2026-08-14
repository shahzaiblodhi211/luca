"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const POLAR_ORIGINS = new Set(["https://polar.sh", "https://sandbox.polar.sh"]);
const MESSAGE_TYPE = "POLAR_CHECKOUT";

type PolarInlineCheckoutProps = {
  checkoutUrl: string;
  theme?: "light" | "dark";
  className?: string;
  onLoaded?: () => void;
  onClose?: () => void;
};

/** Embeds Polar payment form inline (left column of Luca checkout). */
export function PolarInlineCheckout({
  checkoutUrl,
  theme = "dark",
  className,
  onLoaded,
  onClose,
}: PolarInlineCheckoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const url = new URL(checkoutUrl);
    url.searchParams.set("embed", "true");
    url.searchParams.set("embed_origin", window.location.origin);
    url.searchParams.set("theme", theme);

    const iframe = document.createElement("iframe");
    iframe.src = url.toString();
    iframe.title = "Secure payment";
    iframe.allow = `payment 'self' ${[...POLAR_ORIGINS].join(" ")}; publickey-credentials-get 'self' ${[...POLAR_ORIGINS].join(" ")};`;
    iframe.className = "h-full min-h-[640px] w-full border-0 bg-transparent";
    iframe.style.colorScheme = "dark";

    container.replaceChildren(iframe);
    setLoading(true);

    const onMessage = (event: MessageEvent) => {
      if (!POLAR_ORIGINS.has(event.origin)) return;
      const data = event.data as {
        type?: string;
        event?: string;
        redirect?: boolean;
        successURL?: string;
      };
      if (data?.type !== MESSAGE_TYPE) return;

      switch (data.event) {
        case "loaded":
          setLoading(false);
          onLoaded?.();
          break;
        case "close":
          onClose?.();
          break;
        case "success":
          if (data.redirect && data.successURL) {
            window.location.href = data.successURL;
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      container.replaceChildren();
    };
  }, [checkoutUrl, theme, onClose, onLoaded]);

  return (
    <div className={cn("relative w-full", className)}>
      {loading && (
        <div className="absolute inset-0 z-10 flex min-h-[640px] items-center justify-center">
          <Loader2
            className="h-6 w-6 animate-spin text-emerald-400"
            aria-label="Loading payment form"
          />
        </div>
      )}
      <div ref={containerRef} className="min-h-[640px] w-full" />
    </div>
  );
}

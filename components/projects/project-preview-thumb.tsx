"use client";

import { useEffect, useRef, useState } from "react";
import { LucaMark } from "@/components/brand/logo";
import { ShimmerBlock } from "@/components/ui/shimmer-block";
import { previewApiUrl } from "@/lib/preview/client-api-url";
import {
  previewUrlForRoute,
  resolvePreviewIframeBase,
  type PreviewUrlPayload,
} from "@/lib/preview/browser-preview-url";
import { cn } from "@/lib/utils";

const THUMB_W = 1280;
const THUMB_H = 800;
const MAX_CONCURRENT = 2;

let warmActive = 0;
const warmQueue: Array<() => void> = [];

function acquireWarmSlot(): Promise<void> {
  if (warmActive < MAX_CONCURRENT) {
    warmActive++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    warmQueue.push(() => {
      warmActive++;
      resolve();
    });
  });
}

function releaseWarmSlot() {
  warmActive = Math.max(0, warmActive - 1);
  const next = warmQueue.shift();
  if (next) next();
}

type ThumbState = "idle" | "loading" | "ready" | "error";

export function ProjectPreviewThumb({ chatId }: { chatId: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<ThumbState>("idle");
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [scale, setScale] = useState(0.25);
  const startedRef = useRef(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setVisible(true);
      },
      { rootMargin: "120px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect.width ?? el.clientWidth;
      if (w > 0) setScale(w / THUMB_W);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;

    void (async () => {
      setState("loading");
      await acquireWarmSlot();
      if (cancelled) {
        releaseWarmSlot();
        return;
      }

      try {
        const getRes = await fetch(
          `${previewApiUrl()}?chatId=${encodeURIComponent(chatId)}`,
        );
        const getData = (await getRes.json()) as PreviewUrlPayload & {
          error?: string;
          status?: string;
        };
        let payload = getData;
        const existing = resolvePreviewIframeBase(getData);
        if (!existing) {
          const warmRes = await fetch(`${previewApiUrl()}/warm`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chatId }),
          });
          payload = (await warmRes.json()) as PreviewUrlPayload & {
            error?: string;
            status?: string;
          };
          if (!warmRes.ok) throw new Error(payload.error || "Preview failed");
        }

        if (cancelled) return;
        const base = resolvePreviewIframeBase(payload);
        if (!base) throw new Error("No preview URL");
        setPreviewSrc(previewUrlForRoute(base, "/"));
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      } finally {
        releaseWarmSlot();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, chatId]);

  return (
    <div
      ref={rootRef}
      className="relative flex aspect-[16/10] items-center justify-center overflow-hidden bg-zinc-900/80"
    >
      {state === "loading" || state === "idle" ? (
        <ShimmerBlock className="absolute inset-0" />
      ) : null}

      {state === "error" ? (
        <>
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(52,211,153,0.06),_transparent_65%)]"
          />
          <LucaMark
            size="lg"
            className="relative opacity-35 transition-opacity group-hover:opacity-50"
          />
        </>
      ) : null}

      {previewSrc && state === "ready" ? (
        <div
          className={cn(
            "pointer-events-none absolute left-0 top-0 overflow-hidden bg-white",
            "transition-opacity duration-300",
          )}
          style={{
            width: THUMB_W * scale,
            height: THUMB_H * scale,
          }}
        >
          <iframe
            title=""
            src={previewSrc}
            tabIndex={-1}
            loading="lazy"
            className="absolute left-0 top-0 border-0 bg-white"
            style={{
              width: THUMB_W,
              height: THUMB_H,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      ) : null}

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-950/40 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100"
      />
    </div>
  );
}

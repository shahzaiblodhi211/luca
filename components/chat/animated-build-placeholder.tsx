"use client";

import { useEffect, useState } from "react";

const PREFIX = "Let's build ";
const PHRASES = [
  "a customer portal...",
  "an admin panel...",
  "a SaaS landing page...",
] as const;

const TYPE_MS = 48;
const DELETE_MS = 32;
const HOLD_MS = 2200;
const BETWEEN_MS = 400;

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export function AnimatedBuildPlaceholder({
  active,
  className,
}: {
  active: boolean;
  className?: string;
}) {
  const [suffix, setSuffix] = useState("");

  useEffect(() => {
    if (!active) {
      setSuffix("");
      return;
    }

    const ac = new AbortController();
    let phraseIndex = 0;

    void (async () => {
      try {
        while (!ac.signal.aborted) {
          const phrase = PHRASES[phraseIndex]!;
          for (let i = 1; i <= phrase.length; i++) {
            setSuffix(phrase.slice(0, i));
            await sleep(TYPE_MS, ac.signal);
          }
          await sleep(HOLD_MS, ac.signal);

          for (let i = phrase.length - 1; i >= 0; i--) {
            setSuffix(phrase.slice(0, i));
            await sleep(DELETE_MS, ac.signal);
          }
          await sleep(BETWEEN_MS, ac.signal);
          phraseIndex = (phraseIndex + 1) % PHRASES.length;
        }
      } catch {
        /* aborted */
      }
    })();

    return () => ac.abort();
  }, [active]);

  if (!active) return null;

  return (
    <span className={className} aria-hidden>
      {PREFIX}
      {suffix}
    </span>
  );
}

export { PREFIX as BUILD_PLACEHOLDER_PREFIX };

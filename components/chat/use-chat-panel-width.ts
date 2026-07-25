"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "luca-chat-panel-width";
export const CHAT_PANEL_DEFAULT = 400;
export const CHAT_PANEL_MIN = 300;
export const CHAT_PANEL_MAX = 640;

function readStored(): number {
  if (typeof window === "undefined") return CHAT_PANEL_DEFAULT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(n)) {
      return Math.min(CHAT_PANEL_MAX, Math.max(CHAT_PANEL_MIN, n));
    }
  } catch {
    /* ignore */
  }
  return CHAT_PANEL_DEFAULT;
}

export function useChatPanelWidth() {
  const [width, setWidthState] = useState(CHAT_PANEL_DEFAULT);
  const widthRef = useRef(width);
  widthRef.current = width;

  useEffect(() => {
    setWidthState(readStored());
  }, []);

  const setWidth = useCallback((next: number) => {
    const clamped = Math.min(
      CHAT_PANEL_MAX,
      Math.max(CHAT_PANEL_MIN, Math.round(next)),
    );
    widthRef.current = clamped;
    setWidthState(clamped);
    try {
      localStorage.setItem(STORAGE_KEY, String(clamped));
    } catch {
      /* ignore */
    }
  }, []);

  const getWidth = useCallback(() => widthRef.current, []);

  return { width, setWidth, getWidth };
}

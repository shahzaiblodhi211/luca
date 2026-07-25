"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Brain, Check, ChevronDown } from "lucide-react";
import {
  THINKING_LEVEL_HINTS,
  THINKING_LEVEL_LABELS,
  THINKING_LEVELS,
  type ThinkingLevel,
} from "@/lib/thinking-level";
import { cn } from "@/lib/utils";

type Props = {
  value: ThinkingLevel;
  onChange: (level: ThinkingLevel) => void;
  disabled?: boolean;
};

export function ThinkingLevelPicker({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        title={THINKING_LEVEL_HINTS[value]}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full px-2 text-[12px] text-zinc-400 transition-colors",
          "hover:bg-zinc-800 hover:text-zinc-100",
          "disabled:cursor-not-allowed disabled:opacity-40",
          open && "bg-zinc-800 text-zinc-100",
        )}
      >
        <Brain className="h-3.5 w-3.5 shrink-0 opacity-80" />
        <span className="font-medium text-zinc-200">
          {THINKING_LEVEL_LABELS[value]}
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 opacity-70 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Thinking level"
          className="absolute bottom-full left-0 z-50 mb-2 w-[220px] overflow-hidden rounded-2xl border border-zinc-800 bg-[#141414] py-1 shadow-xl shadow-black/50"
        >
          <p className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            Thinking depth
          </p>
          {THINKING_LEVELS.map((level) => {
            const selected = level === value;
            return (
              <button
                key={level}
                type="button"
                role="option"
                aria-selected={selected}
                className={cn(
                  "flex w-full items-start gap-2 px-3 py-2 text-left transition",
                  selected ? "bg-zinc-800/80" : "hover:bg-zinc-900",
                )}
                onClick={() => {
                  onChange(level);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mt-0.5 h-3.5 w-3.5 shrink-0",
                    selected ? "text-emerald-400" : "opacity-0",
                  )}
                />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-zinc-100">
                    {THINKING_LEVEL_LABELS[level]}
                  </span>
                  <span className="block text-[11px] text-zinc-500">
                    {THINKING_LEVEL_HINTS[level]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

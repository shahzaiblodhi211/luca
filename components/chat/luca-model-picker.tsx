"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  Layers,
  Lock,
  Sparkles,
  Zap,
} from "lucide-react";
import type { PlanId } from "@/lib/billing/plans";
import {
  LUCA_MODEL_TIER_ORDER,
  LUCA_MODEL_TIERS,
  type LucaModelTier,
  canUseLucaModelTier,
} from "@/lib/luca-model-tier";
import { cn } from "@/lib/utils";

type Props = {
  value: LucaModelTier;
  planId: PlanId;
  onChange: (tier: LucaModelTier) => void;
  onUpgrade: () => void;
  disabled?: boolean;
  compact?: boolean;
  /** Composer toolbar vs home/chat top bar */
  variant?: "composer" | "header";
};

const SHORT_LABEL: Record<LucaModelTier, string> = {
  spark: "Spark",
  turbo: "Turbo",
  ultra: "Ultra",
};

function TierIcon({
  tier,
  className,
}: {
  tier: LucaModelTier;
  className?: string;
}) {
  const props = {
    className: cn("h-4 w-4 shrink-0", className),
    strokeWidth: 1.75,
  };
  if (tier === "ultra") return <Zap {...props} />;
  if (tier === "turbo") return <Layers {...props} />;
  return <Sparkles {...props} />;
}

type MenuPos = {
  left: number;
  width: number;
  bottom?: number;
  top?: number;
};

export function LucaModelPicker({
  value,
  planId,
  onChange,
  onUpgrade,
  disabled,
  compact,
  variant = "composer",
}: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const label = compact
    ? SHORT_LABEL[value]
    : LUCA_MODEL_TIERS[value].label;
  const hasLocked = LUCA_MODEL_TIER_ORDER.some(
    (t) => !canUseLucaModelTier(planId, t),
  );
  const isHeader = variant === "header";

  useEffect(() => setMounted(true), []);

  const updateMenuPos = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuW = Math.min(300, window.innerWidth - 16);
    const left = Math.max(
      8,
      Math.min(rect.left, window.innerWidth - menuW - 8),
    );
    const menuH = menuRef.current?.offsetHeight ?? 260;
    const gap = 8;
    const spaceAbove = rect.top;
    const openAbove = spaceAbove >= menuH + gap || spaceAbove > rect.bottom;

    if (openAbove) {
      setMenuPos({
        left,
        width: menuW,
        bottom: window.innerHeight - rect.top + gap,
      });
    } else {
      setMenuPos({
        left,
        width: menuW,
        top: rect.bottom + gap,
      });
    }
  };

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPos();
    const raf = requestAnimationFrame(() => updateMenuPos());
    const onLayout = () => updateMenuPos();
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout, true);
    };
  }, [open, hasLocked]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
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

  const menu =
    open && menuPos ? (
      <div
        ref={menuRef}
        id={listId}
        role="listbox"
        aria-label="Builder model"
        style={{
          position: "fixed",
          left: menuPos.left,
          width: menuPos.width,
          ...(menuPos.bottom != null
            ? { bottom: menuPos.bottom }
            : { top: menuPos.top }),
          zIndex: 200,
        }}
        className="max-h-[min(70vh,360px)] overflow-y-auto overflow-x-hidden rounded-2xl border border-composer-border bg-zinc-950 p-1 shadow-2xl shadow-black/40"
      >
        <div className="py-1">
          {LUCA_MODEL_TIER_ORDER.map((tier) => {
            const meta = LUCA_MODEL_TIERS[tier];
            const allowed = canUseLucaModelTier(planId, tier);
            const selected = tier === value;

            return (
              <button
                key={tier}
                type="button"
                role="option"
                aria-selected={selected}
                aria-disabled={!allowed}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors",
                  allowed ? "hover:bg-zinc-900" : "cursor-default opacity-80",
                  selected && allowed && "bg-zinc-900/50",
                )}
                onClick={() => {
                  if (!allowed) {
                    setOpen(false);
                    onUpgrade();
                    return;
                  }
                  onChange(tier);
                  setOpen(false);
                }}
              >
                <TierIcon
                  tier={tier}
                  className={cn(
                    "h-4 w-4",
                    allowed ? "text-composer-icon" : "text-zinc-600",
                  )}
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[13px] font-medium",
                    allowed ? "text-zinc-100" : "text-zinc-500",
                  )}
                >
                  {meta.label}
                </span>
                {allowed ? (
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0 text-composer-fg",
                      selected ? "opacity-100" : "opacity-0",
                    )}
                  />
                ) : (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
                )}
              </button>
            );
          })}
        </div>

        {hasLocked ? (
          <div className="flex items-center justify-between gap-3 border-t border-zinc-800/90 px-3 py-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-zinc-100">
                Unlock every model
              </p>
              <p className="text-[11px] leading-snug text-zinc-500">
                Plus higher limits and more credits
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onUpgrade();
              }}
              className="shrink-0 rounded-full bg-emerald-600 px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-500"
            >
              Upgrade
            </button>
          </div>
        ) : null}
      </div>
    ) : null;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40",
          variant === "header"
            ? cn(
                "rounded-lg px-2 py-1.5 text-[17px] font-semibold text-composer-fg",
                "hover:bg-composer-icon-hover-bg",
                open && "bg-composer-icon-hover-bg",
              )
            : cn(
                "h-9 max-w-[9.5rem] gap-1.5 rounded-full px-2.5 text-[13px] sm:max-w-[11rem]",
                "text-composer-icon hover:bg-composer-icon-hover-bg hover:text-composer-icon-hover",
                open && "bg-composer-icon-hover-bg text-composer-icon-hover",
              ),
        )}
      >
        {variant === "header" ? (
          <span>Luca</span>
        ) : (
          <>
            <TierIcon tier={value} className="text-composer-muted" />
            <span className="truncate font-medium text-composer-fg">{label}</span>
          </>
        )}
        <ChevronDown
          className={cn(
            "shrink-0 text-composer-muted transition-transform",
            variant === "header" ? "h-4 w-4" : "h-3.5 w-3.5 opacity-70",
            open && "rotate-180",
          )}
        />
      </button>

      {mounted && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}

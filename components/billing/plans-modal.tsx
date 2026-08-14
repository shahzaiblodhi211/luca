"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLANS, PLAN_ORDER, type PlanId } from "@/lib/billing/plans";
import type { PublicBilling } from "@/lib/billing/types";
import { useAuthModal } from "@/components/auth/auth-context";

type PlansModalContextValue = {
  open: boolean;
  openPlans: () => void;
  closePlans: () => void;
};

const PlansModalContext = createContext<PlansModalContextValue | null>(null);

export function PlansProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  const openPlans = useCallback(() => setOpen(true), []);
  const closePlans = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ open, openPlans, closePlans }),
    [open, openPlans, closePlans],
  );

  return (
    <PlansModalContext.Provider value={value}>
      {children}
      <PlansModal open={open} onClose={closePlans} />
    </PlansModalContext.Provider>
  );
}

export function usePlansModal() {
  const ctx = useContext(PlansModalContext);
  if (!ctx) {
    throw new Error("usePlansModal must be used within PlansProvider");
  }
  return ctx;
}

function formatCredits(n: number): string {
  if (n >= 999_000) return "Unlimited";
  return n.toLocaleString();
}

function PlansModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user, billing, openAuth, refreshUser, setBilling } = useAuthModal();
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setMessage(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  async function selectPlan(planId: PlanId) {
    if (!user) {
      openAuth("login");
      return;
    }
    setBusy(planId);
    setMessage(null);
    try {
      const res = await fetch("/api/billing/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        billing?: PublicBilling;
        checkoutUrl?: string;
      };
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      if (!res.ok) {
        setMessage(data.error || "Could not change plan.");
        return;
      }
      if (data.billing) setBilling(data.billing);
      setMessage(data.message || "Plan updated.");
      await refreshUser();
    } catch {
      setMessage("Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  if (!mounted || !open) return null;

  const currentPlan = billing?.planId ?? "free";

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/75 backdrop-blur-[3px] animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="plans-modal-title"
        className={cn(
          "relative z-10 flex max-h-[min(92vh,880px)] w-full max-w-5xl flex-col overflow-hidden",
          "rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl",
          "animate-in fade-in zoom-in-95 duration-200",
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-800/80 px-6 py-5 sm:px-8">
          <div>
            <h2
              id="plans-modal-title"
              className="text-xl font-semibold tracking-tight text-white sm:text-2xl"
            >
              Change your plan
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Free, Plus, and Pro — credits reset each month. One credit ≈ one
              builder message.
            </p>
            {billing && !billing.billingExempt && (
              <p className="mt-2 text-xs text-zinc-400">
                {billing.creditsRemaining.toLocaleString()} credits left this
                month · {billing.creditsRemainingToday.toLocaleString()} left
                today
              </p>
            )}
            {billing?.billingExempt && (
              <p className="mt-2 text-xs text-emerald-400/90">
                Unlimited usage enabled on this account.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {message && (
          <div className="border-b border-zinc-800/80 bg-zinc-900/50 px-6 py-2.5 text-sm text-zinc-300 sm:px-8">
            {message}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
          <div className="grid gap-4 md:grid-cols-3">
            {PLAN_ORDER.map((id) => {
              const plan = PLANS[id];
              const isCurrent = currentPlan === id;
              const isPopular = plan.popular;
              const price =
                plan.priceMonthlyUsd === 0
                  ? "$0"
                  : `$${plan.priceMonthlyUsd}`;

              return (
                <div
                  key={id}
                  className={cn(
                    "flex flex-col rounded-xl border bg-zinc-900/40 p-5",
                    isPopular
                      ? "border-emerald-500/40 ring-1 ring-emerald-500/20"
                      : "border-zinc-800",
                  )}
                >
                  <div className="mb-3 flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-white">
                      {plan.name}
                    </h3>
                    {isPopular && (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                        Popular
                      </span>
                    )}
                  </div>
                  <p className="mb-4 min-h-[2.5rem] text-[13px] leading-snug text-zinc-500">
                    {plan.tagline}
                  </p>
                  <div className="mb-4">
                    <span className="text-3xl font-semibold text-white">
                      {price}
                    </span>
                    <span className="text-sm text-zinc-500"> / month</span>
                  </div>

                  <ul className="mb-5 flex-1 space-y-0 divide-y divide-zinc-800/80 border-t border-zinc-800/80">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex gap-2.5 py-2.5 text-[13px] text-zinc-300"
                      >
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <p className="mb-3 text-[11px] text-zinc-600">
                    {formatCredits(plan.monthlyCredits)} credits/mo · up to{" "}
                    {formatCredits(plan.dailyCredits)}/day
                  </p>

                  {isCurrent ? (
                    <button
                      type="button"
                      disabled
                      className="flex h-10 w-full items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 text-sm font-medium text-zinc-400"
                    >
                      Current plan
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void selectPlan(id)}
                      className={cn(
                        "flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60",
                        isPopular
                          ? "bg-emerald-600 text-white hover:bg-emerald-500"
                          : "border border-zinc-600 bg-transparent text-white hover:border-zinc-400 hover:bg-zinc-800",
                      )}
                    >
                      {busy === id && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      {plan.priceMonthlyUsd === 0
                        ? "Downgrade to Free"
                        : id === "pro"
                          ? "Upgrade to Pro"
                          : "Upgrade to Plus"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

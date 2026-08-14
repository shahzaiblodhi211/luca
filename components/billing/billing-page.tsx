"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { useAuthModal } from "@/components/auth/auth-context";
import { useAuthToast } from "@/components/auth/auth-toast";
import { cn } from "@/lib/utils";
import { PLANS, PLAN_ORDER, type PlanId } from "@/lib/billing/plans";

function BillingInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, billing, loading, refreshUser, openAuth } = useAuthModal();
  const { showToast } = useAuthToast();
  const [busy, setBusy] = useState<PlanId | "portal" | null>(null);

  useEffect(() => {
    if (!loading && !user) openAuth("login");
  }, [loading, user, openAuth]);

  useEffect(() => {
    const checkout = params.get("checkout");
    const error = params.get("error");
    const devPlan = params.get("dev_plan");
    const downgrade = params.get("downgrade");

    if (checkout === "success") {
      showToast({
        type: "success",
        message: "Payment received. Your plan will update in a moment.",
      });
      void refreshUser();
      router.replace("/billing", { scroll: false });
      return;
    }
    if (downgrade === "free") {
      showToast({ type: "success", message: "You are on the Free plan." });
      void refreshUser();
      router.replace("/billing", { scroll: false });
      return;
    }
    if (devPlan === "plus" || devPlan === "pro") {
      showToast({
        type: "success",
        message: `Dev mode: ${devPlan} plan applied.`,
      });
      void refreshUser();
      router.replace("/billing", { scroll: false });
      return;
    }
    if (error) {
      const messages: Record<string, string> = {
        polar_not_configured:
          "Add Polar product IDs in env to enable checkout.",
        missing_product: "Product ID missing for that plan in env.",
        invalid_plan: "Invalid plan selected.",
      };
      showToast({
        type: "error",
        message: messages[error] || "Billing error. Try again.",
      });
      router.replace("/billing", { scroll: false });
    }
  }, [params, refreshUser, router, showToast]);

  async function changePlan(planId: PlanId) {
    if (!user) {
      openAuth("login");
      return;
    }
    setBusy(planId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = (await res.json()) as {
        error?: string;
        checkoutUrl?: string;
        message?: string;
      };

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      if (!res.ok) {
        showToast({ type: "error", message: data.error || "Could not change plan." });
        return;
      }
      if (data.message) showToast({ type: "success", message: data.message });
      await refreshUser();
    } catch {
      showToast({ type: "error", message: "Something went wrong." });
    } finally {
      setBusy(null);
    }
  }

  function openPortal() {
    setBusy("portal");
    window.location.href = "/api/billing/portal";
  }

  if (loading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center p-12 text-zinc-400">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />
      </div>
    );
  }

  const currentPlan = billing?.planId ?? "free";

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
        <div className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-zinc-500">Billing</p>
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Plans & billing
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-zinc-500">
              Upgrade on our secure Luca checkout. Your plan updates after payment.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <p className="text-xs text-zinc-500">Current plan</p>
            <p className="text-lg font-semibold text-white">
              {billing?.planName ?? "Free"}
            </p>
            {billing && !billing.billingExempt && (
              <p className="mt-1 text-xs text-zinc-400">
                {billing.creditsRemaining.toLocaleString()} credits left this month
              </p>
            )}
            {currentPlan !== "free" && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={openPortal}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300"
              >
                {busy === "portal" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5" />
                )}
                Manage subscription
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {PLAN_ORDER.map((id) => {
            const plan = PLANS[id];
            const isCurrent = currentPlan === id;
            const price =
              plan.priceMonthlyUsd === 0 ? "$0" : `$${plan.priceMonthlyUsd}`;

            return (
              <div
                key={id}
                className={cn(
                  "flex flex-col rounded-xl border bg-zinc-900/40 p-5",
                  plan.popular
                    ? "border-emerald-500/40 ring-1 ring-emerald-500/20"
                    : "border-zinc-800",
                )}
              >
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-white">{plan.name}</h2>
                  {plan.popular && (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                      Popular
                    </span>
                  )}
                </div>
                <p className="mb-4 min-h-[2.5rem] text-[13px] text-zinc-500">
                  {plan.tagline}
                </p>
                <div className="mb-4">
                  <span className="text-3xl font-semibold text-white">{price}</span>
                  <span className="text-sm text-zinc-500"> / month</span>
                </div>
                <ul className="mb-5 flex-1 space-y-0 divide-y divide-zinc-800/80 border-t border-zinc-800/80">
                  {plan.features.slice(0, 5).map((feature) => (
                    <li
                      key={feature}
                      className="flex gap-2.5 py-2.5 text-[13px] text-zinc-300"
                    >
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
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
                    onClick={() => void changePlan(id)}
                    className={cn(
                      "flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60",
                      plan.popular
                        ? "bg-emerald-600 text-white hover:bg-emerald-500"
                        : "border border-zinc-600 bg-transparent text-white hover:border-zinc-400 hover:bg-zinc-800",
                    )}
                  >
                    {busy === id && <Loader2 className="h-4 w-4 animate-spin" />}
                    {plan.priceMonthlyUsd === 0
                      ? "Downgrade to Free"
                      : `Upgrade to ${plan.name}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs text-zinc-600">
          Powered by{" "}
          <Link
            href="https://polar.sh"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-500 underline-offset-2 hover:text-zinc-400 hover:underline"
          >
            Polar
          </Link>
        </p>
      </div>
    </div>
  );
}

export function BillingPageContent() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-12 text-zinc-400">
          <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />
        </div>
      }
    >
      <BillingInner />
    </Suspense>
  );
}

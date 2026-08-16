"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LucaMark } from "@/components/brand/logo";
import type { PlanDefinition, PlanId } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

type Currency = "USD" | "PKR";

const FALLBACK_PKR = 278;

function formatMoney(usd: number, currency: Currency, rate: number): string {
  if (currency === "USD") {
    return `$${usd.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `PKR ${(usd * rate).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

type CheckoutPlanSummaryProps = {
  plan: PlanDefinition;
  planId: Exclude<PlanId, "free">;
  className?: string;
};

export function CheckoutPlanSummary({
  plan,
  className,
}: CheckoutPlanSummaryProps) {
  const [currency, setCurrency] = useState<Currency>("USD");
  const [rate, setRate] = useState(FALLBACK_PKR);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          "https://api.frankfurter.app/latest?from=USD&to=PKR",
        );
        const data = (await res.json()) as { rates?: { PKR?: number } };
        if (!cancelled && data.rates?.PKR) setRate(data.rates.PKR);
      } catch {
        /* keep fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const monthly = plan.priceMonthlyUsd;
  const billed = useMemo(
    () => formatMoney(monthly, currency, rate),
    [monthly, currency, rate],
  );

  return (
    <aside
      className={cn(
        "flex h-full w-full max-w-[460px] flex-col text-white",
        className,
      )}
    >
      <div className="mb-12 flex items-center gap-3">
        <Link
          href="/billing"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
          aria-label="Back to plans"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <LucaMark size="sm" />
      </div>

      <p className="text-[15px] text-white">Subscribe to Luca {plan.name}</p>
      <h1 className="mt-3 flex items-end gap-2.5">
        <span className="text-[2.5rem] font-semibold leading-none tracking-tight sm:text-[2.75rem]">
          {billed}
        </span>
        <span className="mb-0.5 text-[13px] leading-tight text-zinc-500">
          per
          <br />
          month
        </span>
      </h1>

      <div className="mt-10 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setCurrency("PKR")}
          className={cn(
            "inline-flex items-center justify-center gap-2.5 rounded-xl px-5 py-3 text-sm font-semibold transition-colors",
            currency === "PKR"
              ? "bg-black text-white ring-1 ring-white"
              : "bg-zinc-800 text-white hover:bg-zinc-700",
          )}
        >
          <img
            src="https://flagcdn.com/w40/pk.png"
            alt=""
            width={18}
            height={12}
            className="h-3 w-[18px] rounded-[2px] object-cover"
          />
          PKR
        </button>
        <button
          type="button"
          onClick={() => setCurrency("USD")}
          className={cn(
            "inline-flex items-center justify-center gap-2.5 rounded-xl px-5 py-3 text-sm font-semibold transition-colors",
            currency === "USD"
              ? "bg-black text-white ring-1 ring-white"
              : "bg-zinc-800 text-white hover:bg-zinc-700",
          )}
        >
          <img
            src="https://flagcdn.com/w40/us.png"
            alt=""
            width={18}
            height={12}
            className="h-3 w-[18px] rounded-[2px] object-cover"
          />
          USD
        </button>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-zinc-500">
        {currency === "PKR"
          ? `1 USD = ${rate.toLocaleString("en-US", { maximumFractionDigits: 4 })} PKR. Charges can vary based on exchange rates.`
          : "Billed in USD. Switch to PKR to preview the local amount."}
      </p>

      <div className="mt-12 rounded-xl border border-white/15 bg-transparent px-4 py-4">
        <div className="flex items-start gap-3">
          <LucaMark size="sm" className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm font-medium text-white">Luca {plan.name}</p>
              <p className="shrink-0 text-sm tabular-nums text-zinc-200">
                {formatMoney(monthly, currency, rate)}
              </p>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
              {plan.tagline} {plan.monthlyCredits.toLocaleString()} credits /
              month.
            </p>
            <p className="mt-2 text-[12px] text-zinc-500">Billed monthly</p>
          </div>
        </div>
      </div>

      <div className="mt-12 space-y-3.5 text-sm">
        <div className="flex items-center justify-between gap-4 text-zinc-400">
          <span>Subtotal</span>
          <span className="tabular-nums text-zinc-200">
            {formatMoney(monthly, currency, rate)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 text-zinc-500">
          <span>Tax</span>
          <span>Calculated with payment</span>
        </div>
        <div className="flex items-center justify-between gap-4 pt-1 text-[15px] font-semibold text-white">
          <span>Total due today</span>
          <span className="tabular-nums">
            {formatMoney(monthly, currency, rate)}
          </span>
        </div>
      </div>
    </aside>
  );
}

"use client";

import type { LucideIcon } from "lucide-react";
import {
  Brain,
  Gauge,
  Paperclip,
  Rocket,
  Sparkles,
  Zap,
} from "lucide-react";
import type { PlanDefinition, PlanId } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

type FeatureHighlight = {
  icon: LucideIcon;
  label: string;
};

const CHECKOUT_HIGHLIGHTS: Record<"plus" | "pro", FeatureHighlight[]> = {
  plus: [
    { icon: Zap, label: "Luca Turbo builder — faster, smarter responses" },
    { icon: Gauge, label: "600 builder credits every month" },
    { icon: Sparkles, label: "Up to 30 credits per day" },
    { icon: Brain, label: "Thinking depth up to Medium" },
    { icon: Paperclip, label: "Higher attachment & upload limits" },
    { icon: Rocket, label: "Priority builder speed" },
  ],
  pro: [
    { icon: Zap, label: "Luca Ultra builder — best model & quality" },
    { icon: Gauge, label: "2,000 builder credits every month" },
    { icon: Sparkles, label: "Up to 80 credits per day" },
    { icon: Brain, label: "Thinking depth up to High" },
    { icon: Paperclip, label: "Largest attachments & exports" },
    { icon: Rocket, label: "Early access to new agent tools" },
  ],
};

type CheckoutPlanSummaryProps = {
  plan: PlanDefinition;
  planId: "plus" | "pro";
  className?: string;
};

export function CheckoutPlanSummary({
  plan,
  planId,
  className,
}: CheckoutPlanSummaryProps) {
  const highlights = CHECKOUT_HIGHLIGHTS[planId];
  const monthly = plan.priceMonthlyUsd;

  return (
    <aside
      className={cn(
        "flex flex-col rounded-2xl border border-zinc-800/90 bg-zinc-900/60 p-6 sm:p-7",
        className,
      )}
    >
      <h2 className="text-[1.35rem] font-semibold tracking-tight text-white">
        {plan.name} plan
      </h2>

      <div className="mt-6">
        <p className="text-sm font-medium text-zinc-400">Top features</p>
        <ul className="mt-4 space-y-4">
          {highlights.map(({ icon: Icon, label }) => (
            <li key={label} className="flex gap-3 text-[13px] leading-snug text-zinc-300">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10">
                <Icon className="h-3.5 w-3.5 text-emerald-400" strokeWidth={1.75} />
              </span>
              <span className="pt-1">{label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8 space-y-3 border-t border-zinc-800/80 pt-6 text-sm">
        <div className="flex items-center justify-between gap-4 text-zinc-400">
          <span>Monthly subscription</span>
          <span className="tabular-nums text-zinc-200">${monthly}.00</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-zinc-500">
          <span>Tax</span>
          <span className="text-zinc-400">Calculated at checkout</span>
        </div>
        <div className="flex items-center justify-between gap-4 pt-1 text-base font-semibold text-white">
          <span>Due today</span>
          <span className="tabular-nums">${monthly}.00</span>
        </div>
      </div>

      <p className="mt-6 text-[11px] leading-relaxed text-zinc-500">
        Your subscription renews monthly until you cancel. Complete payment on
        the left to subscribe. Cancel anytime from{" "}
        <span className="text-zinc-400">Plans & billing</span>.
      </p>
    </aside>
  );
}

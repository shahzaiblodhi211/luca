"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuthModal } from "@/components/auth/auth-context";
import { usePlansModal } from "@/components/billing/plans-modal";
import { useShell } from "@/components/chat/shell-context";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "luca-upgrade-banner-dismissed";

export function UpgradePlanBanner() {
  const { billing, loading } = useAuthModal();
  const { openPlans } = usePlansModal();
  const { previewOpen } = useShell();
  const [dismissed, setDismissed] = useState(true);
  const [limitDismissed, setLimitDismissed] = useState(false);

  useEffect(() => {
    setDismissed(sessionStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  const isFree =
    !billing?.billingExempt && (billing?.planId ?? "free") === "free";
  const dailyLimit =
    !!billing && !billing.billingExempt && billing.creditsRemainingToday <= 0;
  const monthlyOut =
    !!billing && !billing.billingExempt && billing.creditsRemaining <= 0;
  const atLimit = dailyLimit || monthlyOut;

  useEffect(() => {
    setLimitDismissed(false);
  }, [dailyLimit, monthlyOut]);

  const message = monthlyOut
    ? previewOpen
      ? "Out of monthly credits. Upgrade to keep building."
      : "You're out of monthly credits. Upgrade your plan to keep building."
    : dailyLimit
      ? previewOpen
        ? "Daily limit reached. Upgrade or try again tomorrow."
        : "Daily credit limit reached. Upgrade for more credits, or try again tomorrow."
      : previewOpen
        ? "Upgrade to Plus for more credits"
        : "Upgrade to Plus to unlock all of Luca's features and more credits";

  const show = !loading && (atLimit ? !limitDismissed : isFree && !dismissed);

  if (!show) return null;

  return (
    <div
      className={cn(
        "flex items-center rounded-b-[21px] border-t border-zinc-800/90 bg-zinc-900/90",
        previewOpen ? "gap-2 px-2.5 py-1" : "gap-3 px-3.5 py-2",
      )}
    >
      <p
        className={cn(
          "min-w-0 flex-1 leading-snug text-zinc-400",
          previewOpen ? "truncate text-[11px]" : "text-[12.5px]",
        )}
        title={previewOpen ? message : undefined}
      >
        {message}
      </p>
      <button
        type="button"
        onClick={openPlans}
        className={cn(
          "shrink-0 font-medium text-emerald-400 transition-colors hover:text-emerald-300",
          previewOpen ? "text-[11px]" : "text-[12.5px]",
        )}
      >
        {previewOpen ? "Upgrade" : "Upgrade Plan"}
      </button>
      <button
        type="button"
        aria-label="Dismiss upgrade banner"
        onClick={() => {
          if (atLimit) {
            setLimitDismissed(true);
            return;
          }
          sessionStorage.setItem(STORAGE_KEY, "1");
          setDismissed(true);
        }}
        className="shrink-0 rounded-md p-0.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
      >
        <X className={previewOpen ? "h-3 w-3" : "h-3.5 w-3.5"} strokeWidth={2} />
      </button>
    </div>
  );
}

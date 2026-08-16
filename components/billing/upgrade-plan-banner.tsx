"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuthModal } from "@/components/auth/auth-context";
import { usePlansModal } from "@/components/billing/plans-modal";

const STORAGE_KEY = "luca-upgrade-banner-dismissed";

export function UpgradePlanBanner() {
  const { billing, loading } = useAuthModal();
  const { openPlans } = usePlansModal();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(sessionStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  const isFree =
    !billing?.billingExempt && (billing?.planId ?? "free") === "free";

  if (loading || !isFree || dismissed) return null;

  return (
    <div className="flex items-center gap-3 rounded-b-[21px] border-t border-zinc-800/90 bg-zinc-900/90 px-3.5 py-2">
      <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-zinc-400">
        Upgrade to Plus to unlock all of Luca&apos;s features and more credits
      </p>
      <button
        type="button"
        onClick={openPlans}
        className="shrink-0 text-[12.5px] font-medium text-emerald-400 transition-colors hover:text-emerald-300"
      >
        Upgrade Plan
      </button>
      <button
        type="button"
        aria-label="Dismiss upgrade banner"
        onClick={() => {
          sessionStorage.setItem(STORAGE_KEY, "1");
          setDismissed(true);
        }}
        className="shrink-0 rounded-md p-0.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}

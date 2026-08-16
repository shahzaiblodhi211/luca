"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  CheckoutPageSkeleton,
  CheckoutPaySkeleton,
} from "@/components/billing/checkout-skeletons";
import { CheckoutPlanSummary } from "@/components/billing/checkout-plan-summary";
import { LucaPayForm } from "@/components/billing/luca-pay-form";
import { PLANS } from "@/lib/billing/plans";
import type { PolarCheckoutSession } from "@/lib/polar/create-checkout-session";
import type { PublicUser } from "@/lib/auth/types";

function CheckoutInner({ user }: { user: PublicUser }) {
  const router = useRouter();
  const params = useSearchParams();

  const planId = useMemo(() => {
    const raw = String(params.get("plan") || "").toLowerCase();
    return raw === "plus" || raw === "pro" ? raw : null;
  }, [params]);

  const plan = planId ? PLANS[planId] : null;

  const [checkout, setCheckout] = useState<PolarCheckoutSession | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!planId) {
      router.replace("/billing?error=invalid_plan");
    }
  }, [planId, router]);

  useEffect(() => {
    if (!planId) return;

    let cancelled = false;
    setSessionLoading(true);
    setSessionError(null);
    setCheckout(null);

    void (async () => {
      try {
        const res = await fetch("/api/billing/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId }),
        });
        const data = (await res.json()) as {
          error?: string;
          checkout?: PolarCheckoutSession;
          devMode?: boolean;
        };

        if (cancelled) return;

        if (data.devMode) {
          router.replace(`/billing?dev_plan=${planId}`);
          return;
        }

        if (!res.ok || !data.checkout) {
          setSessionError(data.error || "Could not start checkout.");
          return;
        }

        setCheckout(data.checkout);
      } catch {
        if (!cancelled) {
          setSessionError("Could not start checkout. Try again.");
        }
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [planId, user.id, retryKey, router]);

  if (!plan || !planId) {
    return <CheckoutPageSkeleton />;
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-2">
      <div className="bg-black px-5 pb-7 pt-12 sm:px-8 sm:pt-14 lg:flex lg:min-h-dvh lg:justify-end lg:px-10 lg:pb-10 lg:pr-[60px] lg:pt-16 xl:px-12 xl:pr-[68px]">
        <CheckoutPlanSummary plan={plan} planId={planId} />
      </div>

      <section className="bg-white px-5 pb-7 pt-12 sm:px-8 sm:pt-14 lg:min-h-dvh lg:px-10 lg:pb-10 lg:pl-[60px] lg:pt-16 xl:px-12 xl:pl-[68px]">
        {sessionError ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 text-center">
            <p className="text-sm text-red-600">{sessionError}</p>
            <button
              type="button"
              onClick={() => setRetryKey((k) => k + 1)}
              className="rounded-lg bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Try again
            </button>
          </div>
        ) : sessionLoading || !checkout ? (
          <CheckoutPaySkeleton />
        ) : (
          <LucaPayForm
            checkout={checkout}
            onPaid={() => router.push("/billing?checkout=success")}
          />
        )}
      </section>
    </div>
  );
}

export function LucaCheckoutPage({ user }: { user: PublicUser }) {
  return (
    <Suspense fallback={<CheckoutPageSkeleton />}>
      <CheckoutInner user={user} />
    </Suspense>
  );
}

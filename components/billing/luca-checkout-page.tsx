"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { LucaMark } from "@/components/brand/logo";
import { CheckoutPlanSummary } from "@/components/billing/checkout-plan-summary";
import { PolarInlineCheckout } from "@/components/billing/polar-inline-checkout";
import { PLANS } from "@/lib/billing/plans";
import type { PublicUser } from "@/lib/auth/types";

function CheckoutInner({ user }: { user: PublicUser }) {
  const router = useRouter();
  const params = useSearchParams();

  const planId = useMemo(() => {
    const raw = String(params.get("plan") || "").toLowerCase();
    return raw === "plus" || raw === "pro" ? raw : null;
  }, [params]);

  const plan = planId ? PLANS[planId] : null;

  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
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
    setCheckoutUrl(null);

    void (async () => {
      try {
        const res = await fetch("/api/billing/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId }),
        });
        const data = (await res.json()) as {
          error?: string;
          checkoutUrl?: string;
          devMode?: boolean;
        };

        if (cancelled) return;

        if (data.devMode) {
          router.replace(`/billing?dev_plan=${planId}`);
          return;
        }

        if (!res.ok || !data.checkoutUrl) {
          setSessionError(data.error || "Could not start checkout.");
          return;
        }

        setCheckoutUrl(data.checkoutUrl);
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
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-950">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-zinc-950 text-white">
      <div className="mx-auto max-w-5xl px-5 pb-16 pt-6 sm:px-8 sm:pt-8">
        <div className="mb-8 flex items-center gap-2.5">
          <LucaMark size="xs" />
          <span className="text-sm font-semibold tracking-tight text-zinc-200">
            Luca
          </span>
        </div>

        <Link
          href="/billing"
          className="mb-8 inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Configure your plan
        </Link>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14 xl:gap-16">
          {/* Payment — left, like ChatGPT */}
          <section className="min-w-0">
            <h1 className="text-lg font-semibold text-white">Pay with</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Signed in as{" "}
              <span className="text-zinc-300">{user.email}</span>
            </p>

            <div className="mt-6">
              {sessionError ? (
                <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-2xl border border-red-500/20 bg-zinc-900/40 p-8 text-center">
                  <p className="text-sm text-red-300">{sessionError}</p>
                  <button
                    type="button"
                    onClick={() => setRetryKey((k) => k + 1)}
                    className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
                  >
                    Try again
                  </button>
                </div>
              ) : sessionLoading || !checkoutUrl ? (
                <div className="flex min-h-[640px] items-center justify-center">
                  <Loader2
                    className="h-6 w-6 animate-spin text-emerald-400"
                    aria-label="Preparing checkout"
                  />
                </div>
              ) : (
                <PolarInlineCheckout
                  checkoutUrl={checkoutUrl}
                  theme="dark"
                  onClose={() => router.push("/billing")}
                />
              )}
            </div>
          </section>

          {/* Plan summary — right card */}
          <section className="lg:pt-9">
            <CheckoutPlanSummary plan={plan} planId={planId} />

            <p className="mt-5 text-[11px] leading-relaxed text-zinc-600">
              By subscribing, you authorize Luca to charge your payment method
              each month until you cancel. Tax may apply based on your billing
              address. See our terms and privacy policy for details.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export function LucaCheckoutPage({ user }: { user: PublicUser }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-zinc-950">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-400" aria-label="Loading" />
        </div>
      }
    >
      <CheckoutInner user={user} />
    </Suspense>
  );
}

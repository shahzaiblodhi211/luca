"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { FileText, Loader2, X } from "lucide-react";
import { useAuthModal } from "@/components/auth/auth-context";
import { useAuthToast } from "@/components/auth/auth-toast";
import { CardBrandMark } from "@/components/billing/card-brand-mark";
import { CheckoutPaySkeleton } from "@/components/billing/checkout-skeletons";
import { LucaPayForm } from "@/components/billing/luca-pay-form";
import { usePlansModal } from "@/components/billing/plans-modal";
import { ShimmerBlock } from "@/components/ui/shimmer-block";
import { getPlan } from "@/lib/billing/plans";
import type { PolarCheckoutSession } from "@/lib/polar/create-checkout-session";
import type {
  BillingInvoice,
  BillingOverview,
  BillingPaymentMethod,
  BillingSubscription,
} from "@/lib/billing/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatRange(start: string, end: string): string {
  const a = new Date(start);
  const b = new Date(end);
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
  const left = a.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const right = b.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${left} – ${right}`;
}

function formatCents(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount / 100);
}

function formatCardBrand(brand: string): string {
  const known: Record<string, string> = {
    visa: "Visa",
    mastercard: "Mastercard",
    amex: "American Express",
    american_express: "American Express",
    discover: "Discover",
    diners: "Diners Club",
    jcb: "JCB",
    unionpay: "UnionPay",
  };
  return known[brand.toLowerCase()] || brand;
}

function formatCardExpiry(card: BillingPaymentMethod): string | null {
  if (!card.expMonth || !card.expYear) return null;
  return `${String(card.expMonth).padStart(2, "0")}/${card.expYear}`;
}

function InvoiceStatusPill({ status }: { status: string }) {
  const key = status.toLowerCase();
  const tone =
    key === "paid"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
      : key === "open" || key === "pending"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
        : key === "failed" || key === "void" || key === "uncollectible"
          ? "border-red-500/20 bg-red-500/10 text-red-300"
          : key === "refunded"
            ? "border-sky-500/20 bg-sky-500/10 text-sky-300"
            : "border-zinc-700 bg-zinc-900 text-zinc-300";

  return (
    <span
      className={`inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-medium capitalize ${tone}`}
    >
      {status}
    </span>
  );
}

function usagePct(used: number, max: number): string {
  if (max <= 0) return "—";
  return `${Math.min(100, (used / max) * 100).toFixed(1)}%`;
}

const outlineBtn =
  "inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-60";

function BillingInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, billing, loading, refreshUser, openAuth, setBilling } =
    useAuthModal();
  const { showToast } = useAuthToast();
  const { openPlans } = usePlansModal();
  const [busy, setBusy] = useState<"update" | "cancel" | null>(null);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateCheckout, setUpdateCheckout] =
    useState<PolarCheckoutSession | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) openAuth("login");
  }, [loading, user, openAuth]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setOverviewLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/billing/overview");
        const data = (await res.json()) as BillingOverview & { error?: string };
        if (cancelled || !res.ok) return;
        setOverview(data);
        if (data.billing) setBilling(data.billing);
      } catch {
        /* keep local billing */
      } finally {
        if (!cancelled) setOverviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, setBilling]);

  useEffect(() => {
    const checkout = params.get("checkout");
    const error = params.get("error");
    const devPlan = params.get("dev_plan");
    const downgrade = params.get("downgrade");

    if (checkout === "success") {
      void (async () => {
        try {
          const res = await fetch("/api/billing/confirm", { method: "POST" });
          const data = (await res.json()) as {
            applied?: boolean;
            planId?: string;
          };
          if (data.applied && data.planId && data.planId !== "free") {
            showToast({
              type: "success",
              message: `You're on Luca ${data.planId === "pro" ? "Pro" : "Plus"}.`,
            });
          } else {
            showToast({
              type: "success",
              message:
                "Payment received. Refresh billing if your plan hasn't updated yet.",
            });
          }
        } catch {
          showToast({
            type: "success",
            message: "Payment received. Your plan will update in a moment.",
          });
        }
        await refreshUser();
        router.replace("/billing", { scroll: false });
      })();
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

  async function openUpdateBilling() {
    const currentPlanId = billing?.planId ?? overview?.billing.planId ?? "free";
    if (currentPlanId === "free") {
      openPlans();
      return;
    }
    setUpdateOpen(true);
    setUpdateError(null);
    setUpdateCheckout(null);
    setBusy("update");
    try {
      const res = await fetch("/api/billing/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: currentPlanId }),
      });
      const data = (await res.json()) as {
        error?: string;
        checkout?: PolarCheckoutSession;
        devMode?: boolean;
      };
      if (data.devMode) {
        setUpdateOpen(false);
        showToast({ type: "success", message: "Dev mode: billing is already applied." });
        await refreshUser();
        return;
      }
      if (!res.ok || !data.checkout) {
        setUpdateError(data.error || "Could not open billing update.");
        return;
      }
      setUpdateCheckout(data.checkout);
    } catch {
      setUpdateError("Could not open billing update. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function cancelPlan() {
    setBusy("cancel");
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        billing?: BillingOverview["billing"];
        atPeriodEnd?: boolean;
      };
      if (!res.ok) {
        showToast({ type: "error", message: data.error || "Could not cancel." });
        return;
      }
      if (data.billing) setBilling(data.billing);
      showToast({
        type: "success",
        message: data.message || "Subscription canceled.",
      });
      setConfirmCancel(false);
      const fresh = await fetch("/api/billing/overview");
      if (fresh.ok) setOverview((await fresh.json()) as BillingOverview);
      await refreshUser();
    } catch {
      showToast({ type: "error", message: "Something went wrong." });
    } finally {
      setBusy(null);
    }
  }

  if (loading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center p-12 text-zinc-400">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />
      </div>
    );
  }

  const current = billing ?? overview?.billing;
  const planId = current?.planId ?? "free";
  const plan = getPlan(planId);
  const paid = planId !== "free";
  const sub: BillingSubscription | null = overview?.subscription ?? null;
  const invoices: BillingInvoice[] = overview?.invoices ?? [];
  const periodStart = sub?.currentPeriodStart;
  const periodEnd = sub?.currentPeriodEnd;
  const canceling = Boolean(sub?.cancelAtPeriodEnd);
  const usedMonthly = current
    ? Math.max(0, current.monthlyCredits - current.creditsRemaining)
    : 0;
  const usedFigma = current?.figmaImportsUsed ?? 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-[1.75rem]">
          Billing & Invoices
        </h1>

        <section className="mt-10 border-b border-zinc-800/80 pb-8">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <h2 className="text-sm font-medium text-zinc-500">Current plan</h2>
              <p className="mt-2 text-[17px] font-semibold text-white">
                {plan.name}{" "}
                <span className="font-medium text-zinc-400">
                  {plan.priceMonthlyUsd === 0
                    ? "$0/mo."
                    : `$${plan.priceMonthlyUsd}/mo.`}
                </span>
              </p>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-zinc-500">
                {plan.tagline}
              </p>
              {current?.billingExempt ? (
                <p className="mt-2 text-sm text-emerald-400/90">
                  Unlimited usage is enabled on this account.
                </p>
              ) : canceling && periodEnd ? (
                <p className="mt-2 text-sm text-zinc-500">
                  Your plan stays active until {formatDate(periodEnd)}.
                </p>
              ) : paid && periodEnd ? (
                <p className="mt-2 text-sm text-zinc-500">
                  Your plan renews on {formatDate(periodEnd)}.
                </p>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">
                  Upgrade anytime from Adjust plan.
                </p>
              )}
            </div>
            <button type="button" onClick={openPlans} className={outlineBtn}>
              Adjust plan
            </button>
          </div>
        </section>

        <section className="border-b border-zinc-800/80 py-8">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <h2 className="text-sm font-medium text-white">Payment</h2>
              {overviewLoading && !overview ? (
                <div className="mt-4 flex items-center gap-3">
                  <ShimmerBlock className="h-10 w-14 rounded-md" />
                  <div className="space-y-1.5">
                    <ShimmerBlock className="h-4 w-36 rounded" />
                    <ShimmerBlock className="h-3 w-24 rounded" />
                  </div>
                </div>
              ) : overview?.paymentMethod ? (
                <div className="mt-4 flex items-center gap-3">
                  <CardBrandMark brand={overview.paymentMethod.brand} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">
                      {formatCardBrand(overview.paymentMethod.brand)} ending in{" "}
                      {overview.paymentMethod.last4}
                    </p>
                    <p className="mt-0.5 text-sm text-zinc-500">
                      {formatCardExpiry(overview.paymentMethod)
                        ? `Expires ${formatCardExpiry(overview.paymentMethod)}`
                        : "This is the card Luca charges each month."}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">
                  {paid
                    ? "No card on file yet. Add one to keep your plan active."
                    : "Add a payment method when you upgrade."}
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void openUpdateBilling()}
              className={outlineBtn}
            >
              {busy === "update" ? "Opening…" : "Update billing"}
            </button>
          </div>
        </section>

        <section className="border-b border-zinc-800/80 py-8">
          <h2 className="text-sm font-medium text-white">Included usage</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {periodStart && periodEnd
              ? `For the current billing cycle (${formatRange(periodStart, periodEnd)})`
              : "For the current billing cycle"}
          </p>

          {overviewLoading && !current ? (
            <div className="mt-5 space-y-2">
              <ShimmerBlock className="h-10 w-full rounded-lg" />
              <ShimmerBlock className="h-10 w-full rounded-lg" />
            </div>
          ) : (
            <div className="mt-5 overflow-hidden rounded-xl border border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-800 bg-zinc-900/40 text-[12px] text-zinc-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Item</th>
                    <th className="px-4 py-2.5 font-medium">Included</th>
                    <th className="px-4 py-2.5 text-right font-medium">Usage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  <tr>
                    <td className="px-4 py-3 text-zinc-200">Builder credits</td>
                    <td className="px-4 py-3 tabular-nums text-zinc-400">
                      {current?.billingExempt
                        ? "Unlimited"
                        : `${usedMonthly.toLocaleString()} / ${plan.monthlyCredits.toLocaleString()}`}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-300">
                      {current?.billingExempt
                        ? "—"
                        : usagePct(usedMonthly, plan.monthlyCredits)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-zinc-200">Daily credits</td>
                    <td className="px-4 py-3 tabular-nums text-zinc-400">
                      {current?.billingExempt
                        ? "Unlimited"
                        : `${(current?.creditsUsedToday ?? 0).toLocaleString()} / ${plan.dailyCredits.toLocaleString()}`}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-300">
                      {current?.billingExempt
                        ? "—"
                        : usagePct(current?.creditsUsedToday ?? 0, plan.dailyCredits)}
                    </td>
                  </tr>
                  {plan.monthlyFigmaImports > 0 && (
                    <tr>
                      <td className="px-4 py-3 text-zinc-200">Figma imports</td>
                      <td className="px-4 py-3 tabular-nums text-zinc-400">
                        {current?.billingExempt
                          ? "Unlimited"
                          : `${usedFigma.toLocaleString()} / ${plan.monthlyFigmaImports.toLocaleString()}`}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-zinc-300">
                        {current?.billingExempt
                          ? "—"
                          : usagePct(usedFigma, plan.monthlyFigmaImports)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="border-b border-zinc-800/80 py-8">
          <h2 className="text-sm font-medium text-white">Invoices</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Receipts from your Luca subscription.
          </p>

          {overviewLoading ? (
            <div className="mt-5 space-y-2">
              <ShimmerBlock className="h-10 w-full rounded-lg" />
              <ShimmerBlock className="h-10 w-full rounded-lg" />
            </div>
          ) : invoices.length === 0 ? (
            <p className="mt-5 text-sm text-zinc-600">No invoices yet.</p>
          ) : (
            <div className="mt-5 overflow-hidden rounded-xl border border-zinc-800">
              <table className="w-full table-fixed text-left text-sm">
                <colgroup>
                  <col className="w-[22%]" />
                  <col className="w-[20%]" />
                  <col className="w-[20%]" />
                  <col className="w-[18%]" />
                  <col className="w-[20%]" />
                </colgroup>
                <thead className="border-b border-zinc-800 bg-zinc-900/40 text-[12px] text-zinc-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Plan</th>
                    <th className="px-4 py-2.5 font-medium">Amount</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Invoice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-400">
                        {formatDate(invoice.date)}
                      </td>
                      <td className="truncate px-4 py-3 text-zinc-200">
                        {invoice.description}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-zinc-200">
                        {formatCents(invoice.amount, invoice.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <InvoiceStatusPill status={invoice.status} />
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={`/api/billing/invoice?id=${encodeURIComponent(invoice.id)}`}
                          className="inline-flex items-center gap-1.5 text-zinc-300 hover:text-white"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          View
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {paid && !current?.billingExempt && (
          <section className="py-8">
            <div className="flex items-start justify-between gap-6">
              <div>
                <h2 className="text-sm font-medium text-white">Cancel</h2>
                <p className="mt-2 text-sm text-zinc-500">
                  {canceling
                    ? "Cancellation is already scheduled for the end of this period."
                    : "We'll be sad to see you go."}
                </p>
              </div>
              {canceling ? (
                <span className="inline-flex h-9 items-center rounded-lg border border-zinc-800 px-3.5 text-sm text-zinc-500">
                  Scheduled
                </span>
              ) : confirmCancel ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => setConfirmCancel(false)}
                    className={outlineBtn}
                  >
                    Keep plan
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void cancelPlan()}
                    className="inline-flex h-9 items-center rounded-lg bg-red-600 px-3.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-60"
                  >
                    {busy === "cancel" && (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    )}
                    Confirm cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => setConfirmCancel(true)}
                  className={outlineBtn}
                >
                  Cancel
                </button>
              )}
            </div>
          </section>
        )}
      </div>

      {updateOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/75 backdrop-blur-[3px]"
            onClick={() => setUpdateOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="update-billing-title"
            className="relative z-10 w-full max-w-[520px] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
              <h2
                id="update-billing-title"
                className="text-[15px] font-semibold text-white"
              >
                Update billing
              </h2>
              <button
                type="button"
                onClick={() => setUpdateOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[min(80vh,720px)] overflow-y-auto px-5 py-6">
              {updateError ? (
                <div className="flex flex-col items-center gap-3 text-center">
                  <p className="text-sm text-red-400">{updateError}</p>
                  <button
                    type="button"
                    onClick={() => void openUpdateBilling()}
                    className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-950"
                  >
                    Try again
                  </button>
                </div>
              ) : !updateCheckout ? (
                <CheckoutPaySkeleton tone="dark" />
              ) : (
                <LucaPayForm
                  checkout={updateCheckout}
                  tone="dark"
                  collectAddress
                  submitLabel="Update billing"
                  footnote="This updates the card and billing address Luca charges each month. You are billed in USD."
                  onPaid={() => {
                    setUpdateOpen(false);
                    showToast({
                      type: "success",
                      message: "Billing details updated.",
                    });
                    void refreshUser();
                    void fetch("/api/billing/overview")
                      .then((res) => (res.ok ? res.json() : null))
                      .then((data) => {
                        if (data) setOverview(data as BillingOverview);
                      });
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
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

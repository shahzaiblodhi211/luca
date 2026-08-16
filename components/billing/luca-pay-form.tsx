"use client";

import {
  Elements,
  ExpressCheckoutElement,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import {
  loadStripe,
  type StripeElementsOptions,
} from "@stripe/stripe-js";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { CheckoutPaySkeleton } from "@/components/billing/checkout-skeletons";
import type { PolarCheckoutSession } from "@/lib/polar/create-checkout-session";
import { cn } from "@/lib/utils";

const fieldClassLight =
  "flex h-11 w-full rounded-lg border border-zinc-200 bg-white px-3.5 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus-visible:border-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-900/10 disabled:bg-zinc-50 disabled:text-zinc-500";

const fieldClassDark =
  "flex h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 text-sm text-white outline-none transition placeholder:text-zinc-500 focus-visible:border-zinc-500 focus-visible:ring-2 focus-visible:ring-white/10 disabled:bg-zinc-900 disabled:text-zinc-500";

type LucaPayFormProps = {
  checkout: PolarCheckoutSession;
  onPaid: () => void;
  submitLabel?: string;
  footnote?: string;
  tone?: "light" | "dark";
  collectAddress?: boolean;
};

function PayFields({
  checkout,
  onPaid,
  submitLabel = "Subscribe",
  footnote,
  tone = "light",
  collectAddress = false,
}: LucaPayFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [name, setName] = useState(checkout.customerName);
  const country = checkout.country || "PK";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expressReady, setExpressReady] = useState(false);

  async function completePayment() {
    if (!stripe || !elements) {
      throw new Error("Payment is still loading.");
    }

    const submitted = await elements.submit();
    if (submitted.error) {
      throw new Error(submitted.error.message || "Check your card details.");
    }

    const token = await stripe.createConfirmationToken({
      elements,
      params: {
        payment_method_data: {
          billing_details: {
            name: name.trim() || null,
            email: checkout.customerEmail,
            ...(collectAddress ? {} : { address: { country } }),
          },
        },
      },
    });

    if (token.error || !token.confirmationToken) {
      throw new Error(token.error?.message || "Could not prepare payment.");
    }

    const preview = token.confirmationToken.payment_method_preview;
    const details = preview?.billing_details;
    const addr = details?.address;
    const customerName = (details?.name || name).trim();
    const card = preview?.card;

    const res = await fetch("/api/billing/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientSecret: checkout.clientSecret,
        confirmationTokenId: token.confirmationToken.id,
        customerName,
        country: addr?.country || country,
        paymentMethod: card
          ? {
              brand: card.brand,
              last4: card.last4,
              expMonth: card.exp_month,
              expYear: card.exp_year,
            }
          : undefined,
        address: {
          line1: addr?.line1 || undefined,
          line2: addr?.line2 || undefined,
          city: addr?.city || undefined,
          state: addr?.state || undefined,
          postalCode: addr?.postal_code || undefined,
          country: addr?.country || country,
        },
      }),
    });
    const data = (await res.json()) as {
      error?: string;
      intentStatus?: string | null;
      intentClientSecret?: string | null;
    };

    if (!res.ok) {
      throw new Error(data.error || "Payment failed.");
    }

    if (data.intentStatus === "requires_action" && data.intentClientSecret) {
      const next = await stripe.handleNextAction({
        clientSecret: data.intentClientSecret,
      });
      if (next.error) {
        throw new Error(next.error.message || "Authentication failed.");
      }
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || busy) return;
    setBusy(true);
    setError(null);
    try {
      await completePayment();
      onPaid();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const dark = tone === "dark";
  const fieldClass = dark ? fieldClassDark : fieldClassLight;

  if (!stripe || !elements) {
    return <CheckoutPaySkeleton tone={tone} />;
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className={cn("flex w-full flex-col", !dark && "max-w-[400px]")}
    >
      <ExpressCheckoutElement
        options={{
          buttonHeight: 48,
          buttonTheme: {
            applePay: dark ? "white" : "black",
            googlePay: dark ? "white" : "black",
            paypal: dark ? "white" : "black",
          },
          layout: { maxColumns: 2, maxRows: 1 },
        }}
        onReady={(event) => {
          const methods = event.availablePaymentMethods;
          setExpressReady(
            Boolean(
              methods && Object.values(methods).some((available) => available),
            ),
          );
        }}
        onConfirm={() => {
          void (async () => {
            setBusy(true);
            setError(null);
            try {
              await completePayment();
              onPaid();
            } catch (err) {
              setError(
                err instanceof Error
                  ? err.message
                  : "Payment failed. Try again.",
              );
            } finally {
              setBusy(false);
            }
          })();
        }}
      />
      {expressReady && (
        <div
          className={cn(
            "my-6 flex items-center gap-3 text-[11px] font-medium tracking-wide",
            dark ? "text-zinc-500" : "text-zinc-400",
          )}
        >
          <span className={cn("h-px flex-1", dark ? "bg-zinc-800" : "bg-zinc-200")} />
          OR
          <span className={cn("h-px flex-1", dark ? "bg-zinc-800" : "bg-zinc-200")} />
        </div>
      )}

      <section>
        <h2
          className={cn(
            "text-[15px] font-semibold",
            dark ? "text-white" : "text-zinc-900",
          )}
        >
          Contact information
        </h2>
        <label
          className={cn(
            "mt-3 mb-1.5 block text-[13px]",
            dark ? "text-zinc-400" : "text-zinc-600",
          )}
        >
          Email
        </label>
        <input
          value={checkout.customerEmail}
          disabled
          autoComplete="email"
          className={fieldClass}
        />
      </section>

      <section className="mt-8">
        <h2
          className={cn(
            "text-[15px] font-semibold",
            dark ? "text-white" : "text-zinc-900",
          )}
        >
          Payment method
        </h2>
        <div className="mt-3">
          <PaymentElement
            options={{
              layout: "tabs",
              wallets: {
                applePay: "never",
                googlePay: "never",
              },
              defaultValues: {
                billingDetails: {
                  name: checkout.customerName,
                  email: checkout.customerEmail,
                  address: { country: checkout.country || "PK" },
                },
              },
              fields: {
                billingDetails: collectAddress
                  ? {
                      name: "auto",
                      address: "auto",
                    }
                  : {
                      address: {
                        country: "never",
                      },
                    },
              },
            }}
          />
        </div>
        {!collectAddress && (
          <>
            <label
              className={cn(
                "mt-4 mb-1.5 block text-[13px]",
                dark ? "text-zinc-400" : "text-zinc-600",
              )}
            >
              Cardholder name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="cc-name"
              required
              className={fieldClass}
            />
          </>
        )}
      </section>

      {error && (
        <p className={cn("mt-4 text-sm", dark ? "text-red-400" : "text-red-600")}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!stripe || busy}
        className={cn(
          "mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-lg text-[15px] font-semibold transition-colors disabled:opacity-60",
          dark
            ? "bg-white text-zinc-950 hover:bg-zinc-200"
            : "bg-zinc-950 text-white hover:bg-zinc-800",
        )}
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy ? "Processing…" : submitLabel}
      </button>

      <p
        className={cn(
          "mt-5 text-center text-[11px] leading-relaxed",
          dark ? "text-zinc-500" : "text-zinc-500",
        )}
      >
        {footnote ||
          "By subscribing, you authorize Luca to charge you each month until you cancel. Amounts shown in PKR are previews; you are billed in USD."}
      </p>
      <p
        className={cn(
          "mt-4 text-center text-[11px]",
          dark ? "text-zinc-600" : "text-zinc-400",
        )}
      >
        Powered by Stripe
      </p>
    </form>
  );
}

export function LucaPayForm({
  checkout,
  onPaid,
  submitLabel,
  footnote,
  tone = "light",
  collectAddress = false,
}: LucaPayFormProps) {
  const stripePromise = useMemo(
    () => loadStripe(checkout.publishableKey),
    [checkout.publishableKey],
  );

  const options = useMemo<StripeElementsOptions>(() => {
    const appearance: StripeElementsOptions["appearance"] =
      tone === "dark"
        ? {
            theme: "night",
            variables: {
              colorPrimary: "#fafafa",
              colorBackground: "#18181b",
              colorText: "#fafafa",
              colorTextSecondary: "#a1a1aa",
              colorDanger: "#f87171",
              colorTextPlaceholder: "#71717a",
              borderRadius: "8px",
              fontFamily: "inherit",
              spacingUnit: "4px",
            },
          }
        : {
            theme: "stripe",
            variables: {
              colorPrimary: "#18181b",
              colorBackground: "#ffffff",
              colorText: "#18181b",
              colorTextSecondary: "#71717a",
              colorDanger: "#dc2626",
              borderRadius: "8px",
              fontFamily: "inherit",
              spacingUnit: "4px",
            },
          };

    if (
      checkout.isPaymentSetupRequired &&
      checkout.isPaymentRequired &&
      checkout.totalAmount
    ) {
      return {
        appearance,
        mode: "subscription",
        setupFutureUsage: "off_session",
        paymentMethodCreation: "manual",
        amount: checkout.totalAmount,
        currency: checkout.currency,
      };
    }
    if (checkout.isPaymentRequired && checkout.totalAmount) {
      return {
        appearance,
        mode: "payment",
        paymentMethodCreation: "manual",
        amount: checkout.totalAmount,
        currency: checkout.currency,
      };
    }
    return {
      appearance,
      mode: "setup",
      paymentMethodCreation: "manual",
      setupFutureUsage: "off_session",
      currency: checkout.currency,
    };
  }, [checkout, tone]);

  return (
    <Elements stripe={stripePromise} options={options}>
      <PayFields
        checkout={checkout}
        onPaid={onPaid}
        submitLabel={submitLabel}
        footnote={footnote}
        tone={tone}
        collectAddress={collectAddress}
      />
    </Elements>
  );
}

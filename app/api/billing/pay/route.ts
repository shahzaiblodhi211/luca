import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { confirmUserPolarPlan } from "@/lib/billing/polar-sync";
import {
  normalizePaymentMethod,
  saveUserPaymentMethod,
} from "@/lib/billing/payment-method";
import { syncUserBilling, toPublicBilling } from "@/lib/billing";
import { getPolarClient } from "@/lib/polar/config";
import type { AddressInput } from "@polar-sh/sdk/models/components/addressinput";

export const runtime = "nodejs";

type PayAddress = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

type PayBody = {
  clientSecret?: string;
  confirmationTokenId?: string;
  customerName?: string;
  country?: string;
  address?: PayAddress;
  paymentMethod?: {
    brand?: string;
    last4?: string;
    expMonth?: number;
    expYear?: number;
  };
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const polar = getPolarClient();
  if (!polar) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  }

  const body = (await req.json()) as PayBody;
  const clientSecret = String(body.clientSecret || "").trim();
  const confirmationTokenId = String(body.confirmationTokenId || "").trim();
  const customerName = String(body.customerName || user.name || "").trim();
  const address = body.address || {};
  const country = String(address.country || body.country || "PK")
    .trim()
    .toUpperCase();

  if (!clientSecret || !confirmationTokenId) {
    return NextResponse.json({ error: "Missing payment details." }, { status: 400 });
  }

  try {
    const checkout = await polar.checkouts.clientGet({ clientSecret });
    const ownerEmail = checkout.customerEmail?.trim().toLowerCase();
    if (ownerEmail && ownerEmail !== user.email.trim().toLowerCase()) {
      return NextResponse.json({ error: "Checkout does not match this account." }, { status: 403 });
    }

    const confirmed = await polar.checkouts.clientConfirm({
      clientSecret,
      checkoutConfirmStripe: {
        confirmationTokenId,
        customerEmail: user.email,
        customerName: customerName || user.name,
        customerBillingAddress: {
          country: country as AddressInput["country"],
          line1: address.line1?.trim() || undefined,
          line2: address.line2?.trim() || undefined,
          city: address.city?.trim() || undefined,
          state: address.state?.trim() || undefined,
          postalCode: address.postalCode?.trim() || undefined,
        },
      },
    });

    const meta = confirmed.paymentProcessorMetadata || {};
    const card = normalizePaymentMethod(body.paymentMethod);
    if (card) await saveUserPaymentMethod(user.id, card);
    const result = await confirmUserPolarPlan(user.id);
    const doc = await syncUserBilling(user.id);

    return NextResponse.json({
      status: confirmed.status,
      intentStatus: meta.intent_status || meta.intentStatus || null,
      intentClientSecret:
        meta.intent_client_secret || meta.intentClientSecret || null,
      successUrl: confirmed.successUrl,
      applied: result.applied,
      planId: result.planId,
      billing: doc ? toPublicBilling(doc) : null,
    });
  } catch (err) {
    const message =
      err && typeof err === "object" && "message" in err
        ? String((err as { message?: string }).message)
        : "Payment failed.";
    console.error("[billing/pay]", err);
    return NextResponse.json(
      { error: message || "Payment failed. Try another card." },
      { status: 400 },
    );
  }
}

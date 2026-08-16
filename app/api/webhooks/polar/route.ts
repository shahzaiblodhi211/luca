import { Webhooks } from "@polar-sh/nextjs";
import {
  applyPolarCheckout,
  applyPolarSubscription,
  revokePolarSubscription,
  syncPolarSubscriptionUpdate,
} from "@/lib/billing/polar-sync";
import { polarWebhookSecret } from "@/lib/polar/config";

export const runtime = "nodejs";

export const POST = Webhooks({
  webhookSecret: polarWebhookSecret() ?? "",
  onCheckoutUpdated: async (payload) => {
    await applyPolarCheckout(payload.data as Record<string, unknown>);
  },
  onOrderPaid: async (payload) => {
    await applyPolarSubscription(payload.data as Record<string, unknown>);
  },
  onSubscriptionCreated: async (payload) => {
    await applyPolarSubscription(payload.data as Record<string, unknown>);
  },
  onSubscriptionActive: async (payload) => {
    await applyPolarSubscription(payload.data as Record<string, unknown>);
  },
  onSubscriptionUpdated: async (payload) => {
    await syncPolarSubscriptionUpdate(payload.data as Record<string, unknown>);
  },
  onSubscriptionCanceled: async (payload) => {
    await revokePolarSubscription(payload.data as Record<string, unknown>);
  },
  onSubscriptionRevoked: async (payload) => {
    await revokePolarSubscription(payload.data as Record<string, unknown>);
  },
  onSubscriptionUncanceled: async (payload) => {
    await applyPolarSubscription(payload.data as Record<string, unknown>);
  },
});

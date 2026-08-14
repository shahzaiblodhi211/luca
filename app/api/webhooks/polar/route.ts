import { Webhooks } from "@polar-sh/nextjs";
import {
  applyPolarSubscription,
  revokePolarSubscription,
  syncPolarSubscriptionUpdate,
} from "@/lib/billing/polar-sync";
import { polarWebhookSecret } from "@/lib/polar/config";

export const runtime = "nodejs";

export const POST = Webhooks({
  webhookSecret: polarWebhookSecret() ?? "",
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

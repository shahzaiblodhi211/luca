import type { PlanId } from "@/lib/billing/plans";

export type OAuthProvider = "google" | "github" | "apple";

export type UserDoc = {
  _id: string;
  email: string;
  name: string;
  imageUrl?: string;
  passwordHash?: string;
  oauth?: Partial<Record<OAuthProvider, string>>;
  polarCustomerId?: string;
  polarSubscriptionId?: string;
  polarSubscriptionStatus?: string;
  planId?: PlanId;
  creditsRemaining?: number;
  creditsUsedToday?: number;
  billingPeriodKey?: string;
  usageDayKey?: string;
  billingExempt?: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type PasswordResetDoc = {
  _id: string;
  userId: string;
  tokenHash: string;
  codeHash?: string;
  expiresAt: Date;
  createdAt: Date;
  usedAt?: Date;
};

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  imageUrl?: string;
};

export type SessionPayload = {
  sub: string;
  email: string;
  name: string;
};

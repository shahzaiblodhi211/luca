import type { PlanId } from "@/lib/billing/plans";

export type UserDoc = {
  _id: string;
  email: string;
  name: string;
  passwordHash: string;
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
  expiresAt: Date;
  createdAt: Date;
  usedAt?: Date;
};

export type PublicUser = {
  id: string;
  email: string;
  name: string;
};

export type SessionPayload = {
  sub: string;
  email: string;
  name: string;
};

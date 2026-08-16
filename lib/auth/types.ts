import type { PlanId } from "@/lib/billing/plans";

export type OAuthProvider = "google" | "github" | "apple";

export type VercelConnection = {
  accessTokenEnc: string;
  teamId?: string;
  vercelUserId?: string;
  username?: string;
  connectedAt: Date;
};

export type FigmaConnection = {
  accessTokenEnc: string;
  refreshTokenEnc?: string;
  expiresAt?: Date;
  figmaUserId?: string;
  handle?: string;
  email?: string;
  connectedAt: Date;
};

export type UserDoc = {
  _id: string;
  email: string;
  name: string;
  imageUrl?: string;
  passwordHash?: string;
  oauth?: Partial<Record<OAuthProvider, string>>;
  figma?: FigmaConnection;
  vercel?: VercelConnection;
  polarCustomerId?: string;
  polarSubscriptionId?: string;
  polarSubscriptionStatus?: string;
  planId?: PlanId;
  creditsRemaining?: number;
  creditsUsedToday?: number;
  figmaImportsUsed?: number;
  billingPeriodKey?: string;
  billingCycleAnchor?: Date;
  usageDayKey?: string;
  billingExempt?: boolean;
  paymentMethod?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  };
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
  figmaConnected?: boolean;
  figmaHandle?: string;
  vercelConnected?: boolean;
  vercelUsername?: string;
};

export type SessionPayload = {
  sub: string;
  email: string;
  name: string;
};

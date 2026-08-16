export function toDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function addUtcMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(day, lastDay),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

export type BillingPeriod = {
  start: Date;
  end: Date;
  key: string;
};

export function currentBillingPeriod(
  anchor: Date,
  now = new Date(),
): BillingPeriod {
  let start = new Date(anchor);
  if (Number.isNaN(start.getTime())) {
    start = now;
  }
  if (now < start) {
    const end = addUtcMonths(start, 1);
    return { start, end, key: periodKey(start) };
  }
  let end = addUtcMonths(start, 1);
  let hops = 0;
  while (now >= end && hops < 240) {
    start = end;
    end = addUtcMonths(start, 1);
    hops += 1;
  }
  return { start, end, key: periodKey(start) };
}

export function periodKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isLegacyMonthKey(key: string | undefined): boolean {
  return Boolean(key && /^\d{4}-\d{2}$/.test(key));
}

export function sameUtcDay(a: Date, b: Date): boolean {
  return periodKey(a) === periodKey(b);
}

export function isSignupInferredAnchor(user: {
  billingCycleAnchor?: Date;
  createdAt?: Date;
}): boolean {
  const anchor = toDate(user.billingCycleAnchor);
  const created = toDate(user.createdAt);
  if (!anchor || !created) return false;
  return sameUtcDay(anchor, created);
}

export function resolveBillingAnchor(user: {
  billingCycleAnchor?: Date;
  createdAt?: Date;
}): Date {
  const anchor = toDate(user.billingCycleAnchor);
  if (anchor && !isSignupInferredAnchor(user)) return anchor;
  return toDate(user.createdAt) ?? new Date();
}

export function paidCyclePeriod(input: {
  polarStart?: Date | null;
  polarEnd?: Date | null;
  purchaseAt?: Date | null;
  now?: Date;
}): BillingPeriod | null {
  const now = input.now ?? new Date();
  const purchaseAt = toDate(input.purchaseAt);
  const polarStart = toDate(input.polarStart);
  const polarEnd = toDate(input.polarEnd);

  if (purchaseAt && polarStart && polarEnd) {
    if (purchaseAt.getTime() - polarStart.getTime() > 2 * 24 * 60 * 60 * 1000) {
      return currentBillingPeriod(purchaseAt, now);
    }
    return { start: polarStart, end: polarEnd, key: periodKey(polarStart) };
  }
  if (polarStart && polarEnd) {
    return { start: polarStart, end: polarEnd, key: periodKey(polarStart) };
  }
  if (purchaseAt) return currentBillingPeriod(purchaseAt, now);
  return null;
}

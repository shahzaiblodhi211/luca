export class BillingError extends Error {
  readonly code:
    | "OUT_OF_CREDITS"
    | "DAILY_LIMIT"
    | "PLAN_REQUIRED"
    | "FIGMA_LIMIT";
  readonly status: number;

  constructor(
    message: string,
    code: BillingError["code"],
    status = 402,
  ) {
    super(message);
    this.name = "BillingError";
    this.code = code;
    this.status = status;
  }
}

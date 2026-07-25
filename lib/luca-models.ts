/** User-facing Luca model names (internal provider ids stay server-side). */
export const LUCA_SPARK = "Luca Spark";
export const LUCA_TURBO = "Luca Turbo";
export const LUCA_ULTRA = "Luca Ultra";

export const LUCA_MODEL_BY_PLAN = {
  free: LUCA_SPARK,
  plus: LUCA_TURBO,
  pro: LUCA_ULTRA,
} as const;

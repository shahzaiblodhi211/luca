import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { findUserByEmail } from "../lib/auth/users";
import { normalizeEmail } from "../lib/auth/password";
import { setUserPlan } from "../lib/billing/credits";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const email = normalizeEmail(
  process.env.OWNER_EMAIL?.trim() || "shahzaiblodhi21@gmail.com",
);
const planId = (process.env.OWNER_PLAN?.trim() || "pro").toLowerCase();
if (planId !== "free" && planId !== "plus" && planId !== "pro") {
  console.error("Invalid plan:", planId);
  process.exit(1);
}

const user = await findUserByEmail(email);
if (!user) {
  console.error("User not found:", email);
  process.exit(1);
}

await setUserPlan(user._id, planId, { billingExempt: true });
console.log(`Plan set to ${planId} (billingExempt) for`, email);

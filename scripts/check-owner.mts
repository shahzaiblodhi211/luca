import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { findUserByEmail } from "../lib/auth/users";
import { normalizeEmail } from "../lib/auth/password";

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

const email = normalizeEmail("shahzaiblodhi21@gmail.com");
const u = await findUserByEmail(email);
if (!u) {
  console.log("NOT_FOUND");
  process.exit(0);
}
console.log(
  JSON.stringify({
    email: u.email,
    planId: u.planId ?? "free",
    billingExempt: Boolean(u.billingExempt),
    creditsRemaining: u.creditsRemaining,
  }),
);

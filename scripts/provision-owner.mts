/**
 * One-time local provisioning for the owner account.
 * Usage (PowerShell):
 *   $env:OWNER_PASSWORD='your-password'; npx tsx scripts/provision-owner.mts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { hashPassword, normalizeEmail } from "../lib/auth/password";
import { findUserByEmail, createUser, getUsersCollection } from "../lib/auth/users";
import { setUserPlan } from "../lib/billing/credits";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
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
const password = process.env.OWNER_PASSWORD?.trim();
const name = process.env.OWNER_NAME?.trim() || "Shahzaib";

if (!password) {
  console.error("Set OWNER_PASSWORD in the environment (not in repo).");
  process.exit(1);
}

const ownerPassword = password;

async function main() {
  let user = await findUserByEmail(email);
  if (!user) {
    user = await createUser({ email, name, password: ownerPassword });
    console.log("Created user:", email);
  } else {
    const col = await getUsersCollection();
    await col.updateOne(
      { _id: user._id },
      {
        $set: {
          name,
          passwordHash: await hashPassword(ownerPassword),
          updatedAt: new Date(),
        },
      },
    );
    user = (await findUserByEmail(email))!;
    console.log("Updated password for:", email);
  }

  await setUserPlan(user._id, "plus", { billingExempt: true });
  console.log("Plan: Plus with billingExempt (unlimited usage).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

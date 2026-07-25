import { spawnSync } from "node:child_process";

const skip =
  process.env.SKIP_PLAYWRIGHT === "1" ||
  process.env.VERCEL === "1" ||
  process.env.CI === "true";

if (skip) {
  console.info("[postinstall] skipping Playwright browser download");
  process.exit(0);
}

const r = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["playwright", "install", "chromium"],
  { stdio: "inherit", shell: process.platform === "win32" },
);
process.exit(r.status ?? 1);

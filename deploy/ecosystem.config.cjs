const fs = require("fs");
const path = require("path");

/** Load repo `.env.local` into pm2 env (preview droplet). */
function loadEnvLocal() {
  const file = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

const envLocal = loadEnvLocal();

/** @type {import('pm2').StartOptions[]} */
module.exports = {
  apps: [
    {
      name: "luca-web",
      cwd: __dirname + "/..",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      env: {
        NODE_ENV: "production",
        ...envLocal,
      },
      max_memory_restart: "1G",
    },
    {
      name: "luca-preview-worker",
      cwd: __dirname + "/..",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "services/preview-worker/src/server.ts",
      env: {
        NODE_ENV: "production",
        SKIP_PLAYWRIGHT: "1",
        ...envLocal,
      },
      max_memory_restart: "2G",
    },
  ],
};

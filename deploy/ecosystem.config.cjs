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
      },
      max_memory_restart: "2G",
    },
  ],
};

# Deploy layout (path 2 — single domain)

```
luca-ai/
  app/                    # Main Next.js Luca app
  services/
    preview-worker/       # Preview API + /_preview/:port proxy
  deploy/
    Caddyfile             # lucaai.app → :3000 + :3001 routes
    ecosystem.config.cjs  # pm2: web + preview-worker
    .env.production.example
  lib/preview/            # Shared preview engine
```

## Production (DigitalOcean + lucaai.app)

1. Clone repo on droplet (4 GB RAM recommended).
2. Copy `deploy/.env.production.example` → `.env.local` and fill secrets.
3. Set `PREVIEW_PUBLIC_ORIGIN=https://lucaai.app`.
4. `npm ci` → `npm run build`.
5. Install Caddy, copy `deploy/Caddyfile` → `/etc/caddy/Caddyfile`, reload Caddy.
6. `npx pm2 start deploy/ecosystem.config.cjs` → `pm2 save`.
7. Name.com: **A** record `@` → droplet IP.

Browser loads previews at `https://lucaai.app/_preview/4103/…` (proxied to loopback `next dev`).

## Local dev

**Single process (default):** `npm run dev` — preview uses `127.0.0.1` if `PREVIEW_PUBLIC_ORIGIN` is unset.

**Production-like:** Terminal 1: `npm run dev`  
Terminal 2: `npm run preview-worker`  
Set in `.env.local`:

```
PREVIEW_PUBLIC_ORIGIN=http://localhost:3000
PREVIEW_WORKER_URL=http://127.0.0.1:3001
```

Use Caddy locally or hit worker directly for API tests.

## Build without Playwright browsers

```bash
SKIP_PLAYWRIGHT=1 npm ci
npm run build
```

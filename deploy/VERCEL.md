# What to push to GitHub (for Vercel + preview droplet)

Push the **whole repo** — one GitHub project powers both deployments.

## ✅ Include (commit & push)

- `app/`, `components/`, `lib/`, `public/`
- `services/preview-worker/` (runs on DigitalOcean, not Vercel)
- `deploy/` (Caddy + pm2 examples)
- `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`, `Prompt.md`, etc.

## ❌ Never push (already in `.gitignore`)

- `.env.local`, `.env*` — set secrets in **Vercel** and on the **droplet**
- `gemini-keys.txt`, `.gemini-key-state.json`
- `.next/`, `node_modules/`
- `.preview-runtime/`, `.preview-workspaces/` (local preview cache)
- `.vercel/` (local Vercel CLI link)

No need for a second repo or a “Vercel-only” branch.

---

# Architecture

| Host | Platform | Role |
|------|----------|------|
| **https://lucaai.app** | **Vercel** | Main Luca app (UI, auth, chat, Gemini) |
| **https://preview.lucaai.app** | **DigitalOcean** | Preview worker (`npm run preview-worker`) |

---

# 1) GitHub → Vercel (main app)

1. Push repo to GitHub.
2. [vercel.com](https://vercel.com) → **Import** repository.
3. **Root directory:** `/` (default).
4. **Build command:** `npm run build`
5. **Install command:** `SKIP_PLAYWRIGHT=1 npm ci` (recommended on Vercel)

### Vercel environment variables

Set in Project → Settings → Environment Variables:

| Variable | Example | Notes |
|----------|---------|--------|
| `MONGODB_URI` | `mongodb+srv://...` | Atlas |
| `GEMINI_API_KEY_1` … | | Or `GEMINI_API_KEYS` |
| `GEMINI_MODEL` | | If you use it |
| Session / auth secrets | | Same as local `.env.local` |
| `SKIP_PLAYWRIGHT` | `1` | Build & install |
| **`PREVIEW_WORKER_URL`** | **`https://preview.lucaai.app`** | **Phase 2 only** — server proxies `/api/preview` → worker |

**Do not** set `PREVIEW_PUBLIC_ORIGIN` on Vercel — that belongs on the **preview droplet** only.

Optional (browser calls worker directly, skips Vercel proxy):

| Variable | Value |
|----------|--------|
| `NEXT_PUBLIC_PREVIEW_API_URL` | `https://preview.lucaai.app/api/preview` |

If you use this, set **`PREVIEW_CORS_ORIGINS`** on the droplet (see below).

6. **Domains:** add **`lucaai.app`** and **`www.lucaai.app`** in Vercel.
7. **Name.com DNS:**
   - `@` → Vercel A record (or CNAME to `cname.vercel-dns.com` per Vercel docs)
   - `www` → Vercel

Redeploy after env changes.

---

# 2) GitHub → DigitalOcean (preview.lucaai.app)

Same repo on a **Droplet** (4 GB RAM recommended):

```bash
git clone https://github.com/YOU/luca-ai.git
cd luca-ai
cp deploy/.env.production.example .env.local
# edit .env.local — see "Preview droplet env" below
SKIP_PLAYWRIGHT=1 npm ci
npm run build   # optional on worker-only box; worker uses tsx + lib at runtime
npm run preview-worker   # or pm2 — only the preview-worker app
```

### Preview droplet env (`.env.local` on server)

```env
PREVIEW_PUBLIC_ORIGIN=https://preview.lucaai.app
PREVIEW_PUBLIC_PATH_PREFIX=/p
PREVIEW_WORKER_PORT=3001
PREVIEW_WORKER_HOST=127.0.0.1

# Same Gemini/Mongo NOT required for worker unless you add auth later
# Worker needs disk + Node; MONGODB only if you extend worker

# If using NEXT_PUBLIC_PREVIEW_API_URL from browser:
PREVIEW_CORS_ORIGINS=https://lucaai.app,https://www.lucaai.app
```

### Caddy on preview droplet

Use `deploy/Caddyfile.preview-subdomain` → `/etc/caddy/Caddyfile`, reload Caddy.

### DNS (Name.com)

| Record | Target |
|--------|--------|
| `preview` | **A** → Droplet IPv4 |

HTTPS: Caddy issues cert for `preview.lucaai.app`.

### pm2 (preview only on small box)

```bash
npx pm2 start deploy/ecosystem.config.cjs --only luca-preview-worker
pm2 save
```

Or run the full `ecosystem` if Luca ever runs on the same machine.

---

# How preview is wired

1. Browser on **lucaai.app** calls **`/api/preview`** (same origin).
2. Vercel **`app/api/preview`** forwards to **`https://preview.lucaai.app/api/preview`** when `PREVIEW_WORKER_URL` is set.
3. Worker starts `next dev` on loopback and returns iframe URL:  
   **`https://preview.lucaai.app/p/{chatId}/`** …
4. Browser loads that URL on the **preview** subdomain (Caddy → worker proxy → port).

---

# Quick checks

- `https://preview.lucaai.app/health` → `{"ok":true,"service":"luca-preview-worker"}`
- Build a project on lucaai.app → preview panel should load iframe on `preview.lucaai.app`

---

# Local dev

- `npm run dev` only → loopback previews (no subdomain).
- Prod-like: `npm run preview-worker` + `PREVIEW_PUBLIC_ORIGIN=https://preview.lucaai.app` on worker + `PREVIEW_WORKER_URL` on Next (or direct `NEXT_PUBLIC_PREVIEW_API_URL`).

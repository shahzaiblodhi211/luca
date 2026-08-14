# Vercel — Phase 1 (Luca live on lucaai.app)

Copy each name into **Vercel → Project → Settings → Environment Variables**  
(Production + Preview + Development as you prefer).

### Bulk import (recommended)

From repo root:

```powershell
npx tsx scripts/generate-vercel-env.mts
```

Open **`deploy/vercel-env-import.env`** (gitignored — contains secrets). In Vercel → **Environment Variables** → **Import .env** → select that file → apply to **Production** (and Preview if you want) → **Redeploy**.

Optional: set production URL before generating:

```powershell
$env:VERCEL_APP_URL="https://lucaai.app"
npx tsx scripts/generate-vercel-env.mts
```

---

| Name | Notes |
|------|--------|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `AUTH_SECRET` | Long random string (session JWT) |
| `NEXT_PUBLIC_APP_URL` | `https://lucaai.app` |
| `SKIP_PLAYWRIGHT` | `1` |
| `GEMINI_API_KEY_1` | First Google AI key (add `_2`, `_3` … as needed) |

Or set **`GEMINI_API_KEYS`** = comma-separated keys (if supported by your loader).

| `GEMINI_MODEL` | e.g. `gemini-3.5-flash-lite` |
| `GEMINI_THINKING_LEVEL` | e.g. `HIGH` |

## Images (match your local setup)

| `IMAGE_PROVIDER` | `auto` (default), `gemini`, `pexels`, or `pollinations` |
| `GEMINI_IMAGE_MODEL` | `gemini-3.1-flash-lite-image` (logos/illustrations) |
| `PEXELS_API_KEY` | Free at [pexels.com/api](https://www.pexels.com/api/) — stock photos for heroes/backgrounds |

## Auth email (Zoho — info@lucaai.app)

See [ZOHO-EMAIL.md](./ZOHO-EMAIL.md).

| Name | Example |
|------|---------|
| `SMTP_HOST` | `smtppro.zoho.com` |
| `SMTP_PORT` | `465` |
| `SMTP_SECURE` | `1` |
| `SMTP_USER` | `info@lucaai.app` |
| `SMTP_PASS` | Zoho app-specific password |
| `AUTH_EMAIL_FROM` | `luca Team <info@lucaai.app>` |
| `AUTH_EMAIL_REPLY_TO` | `info@lucaai.app` |

Optional fallback: `RESEND_API_KEY` (used only if SMTP fails or is unset).

## OAuth (Google, GitHub, Apple)

See [OAUTH.md](./OAUTH.md). Minimum for Google + GitHub:

| Name | Notes |
|------|--------|
| `GOOGLE_CLIENT_ID` | Google OAuth web client |
| `GOOGLE_CLIENT_SECRET` | |
| `GITHUB_CLIENT_ID` | GitHub OAuth app |
| `GITHUB_CLIENT_SECRET` | |

Apple (optional): `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`

## Billing (Polar.sh)

See [POLAR.md](./POLAR.md).

| Name | Notes |
|------|--------|
| `POLAR_ACCESS_TOKEN` | Polar organization token |
| `POLAR_SERVER` | `sandbox` or `production` |
| `POLAR_WEBHOOK_SECRET` | Webhook signing secret |
| `POLAR_PRODUCT_ID_PLUS` | Plus product UUID |
| `POLAR_PRODUCT_ID_PRO` | Pro product UUID |

## Preview (Phase 2 — after DigitalOcean worker)

| `PREVIEW_WORKER_URL` | `https://preview.lucaai.app` |
| `NEXT_PUBLIC_PREVIEW_ORIGIN` | Same as preview host — browser iframe URLs (`https://preview.lucaai.app`) |
| `NEXT_PUBLIC_APP_URL` | `https://www.lucaai.app` — used when proxying preview sync for `/api/images` |

Leave unset for Phase 1 — chat/build works; live iframe preview returns a clear “not configured” until you add this.

---

## Do **not** set on Vercel

- `GEMINI_API_KEYS_FILE` / `gemini-keys.txt` (file not on Vercel — use env keys)
- `PREVIEW_PUBLIC_ORIGIN` (preview droplet only)

---

## Domain

1. Vercel → **Domains** → add `lucaai.app` and `www.lucaai.app`
2. Name.com → point DNS to Vercel (A/CNAME as Vercel shows)
3. Redeploy after env vars are saved

## Git

Push the full repo to GitHub; import that repo in Vercel (root directory `/`).

See also [VERCEL.md](./VERCEL.md) for preview subdomain later.

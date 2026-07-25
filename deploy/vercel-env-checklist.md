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

| `IMAGE_PROVIDER` | `pollinations` or `gemini` |
| `POLLINATIONS_MODEL` | `flux` (if using pollinations) |

## Optional (email reset)

| `RESEND_API_KEY` | |
| `AUTH_EMAIL_FROM` | `Luca AI <noreply@lucaai.app>` |

## Preview (Phase 2 — after DigitalOcean worker)

| `PREVIEW_WORKER_URL` | `https://preview.lucaai.app` |

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

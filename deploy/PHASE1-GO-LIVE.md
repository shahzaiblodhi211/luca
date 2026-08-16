# Phase 1 — Luca live on Vercel (`lucaai.app`)

### Monorepo note

Do **not** use a `services` block in root `vercel.json` for this app — it makes Vercel deploy with no Next.js output (site shows **404 NOT_FOUND**). Use top-level `framework` / `installCommand` / `buildCommand` only. The preview worker under `services/preview-worker/` is Phase 2 on DigitalOcean; keep no nested `package.json` there so Vercel stays a single Next.js project.

---
Do these in order. Preview iframe (DigitalOcean) is **Phase 2** — skip `PREVIEW_WORKER_URL` for now.

---

## 0. Push the app to GitHub (required)

Vercel builds from GitHub. Your remote is:

**https://github.com/shahzaiblodhi211/luca**

If `main` on GitHub is still only an old commit, commit and push your current Luca code **before** importing or redeploying on Vercel. Otherwise production will not match what you run locally.

```powershell
cd G:\Documents\luca-ai
git add -A
git status   # confirm no .env.local or gemini-keys.txt
git commit -m "Prepare Luca for Vercel Phase 1"
git push origin main
```

Never commit `.env.local`, `gemini-keys.txt`, or `.gemini-key-state.json`.

---

## 1. Create the Vercel project

1. Open [vercel.com/new](https://vercel.com/new) (log in with GitHub).
2. **Import** `shahzaiblodhi211/luca`.
3. **Root Directory:** `/` (default).
4. **Framework:** Next.js (auto).
5. **Install Command:** `SKIP_PLAYWRIGHT=1 npm ci`  
   **Build Command:** `npm run build`  
   (These match repo `vercel.json` — Vercel should pick them up automatically.)
6. **Environment Variables:** run `npm run vercel:env` and import `deploy/vercel-env-import.env`, or add the vars from section 2 below (Production at minimum), then **Deploy**.

This repo is already linked (`.vercel/project.json` → project `luca-ai`).

### CLI publish

```powershell
cd G:\Documents\luca-ai
npx vercel login
npm run vercel:env
# Vercel → Settings → Environment Variables → Import .env → deploy/vercel-env-import.env
npm run vercel:prod
```

### GitHub Actions publish

Add these secrets on `shahzaiblodhi211/luca`:

| Secret | Where to get it |
|--------|-----------------|
| `VERCEL_TOKEN` | [vercel.com/account/tokens](https://vercel.com/account/tokens) |
| `VERCEL_ORG_ID` | `.vercel/project.json` → `orgId` |
| `VERCEL_PROJECT_ID` | `.vercel/project.json` → `projectId` |

Pushes to `main` deploy production; pull requests deploy a preview.

Optional CLI inspect:

```powershell
npx vercel env pull .env.vercel.local
```

---

## 2. Environment variables (Production)

Copy values from your local `.env.local` where names match. Full reference: [vercel-env-checklist.md](./vercel-env-checklist.md).

| Variable | Phase 1 value / notes |
|----------|------------------------|
| `MONGODB_URI` | Atlas connection string |
| `AUTH_SECRET` | Same long random string as local |
| `NEXT_PUBLIC_APP_URL` | `https://lucaai.app` (use `https://YOUR-PROJECT.vercel.app` until DNS works) |
| `SKIP_PLAYWRIGHT` | `1` |
| `GEMINI_API_KEY_1` | Required; add `GEMINI_API_KEY_2`, … if you use a pool |
| `GEMINI_MODEL` | Same as local (e.g. your flash model id) |
| `GEMINI_THINKING_LEVEL` | e.g. `HIGH` if you use it locally |
| `IMAGE_PROVIDER` | `pollinations` or `gemini` |
| `POLLINATIONS_MODEL` | e.g. `flux` if using Pollinations |

**Optional:** `RESEND_API_KEY`, `AUTH_EMAIL_FROM` for password reset email.

**Do not set on Phase 1:**

- `PREVIEW_WORKER_URL` — chat/build work; preview panel shows “not configured” until Phase 2.
- `GEMINI_API_KEYS_FILE` — no key file on Vercel; use `GEMINI_API_KEY_*` or `GEMINI_API_KEYS`.

After any env change: **Deployments → … → Redeploy**.

---

## 3. Node.js version

In **Project → Settings → General → Node.js Version**, choose **20.x** (LTS). Avoid relying on Node 25 on the build image.

---

## 4. MongoDB Atlas

In Atlas → **Network Access**, allow Vercel to connect:

- Easiest for launch: `0.0.0.0/0` (tighten later), **or**
- Use Atlas + Vercel integration if you prefer.

Confirm the database user in `MONGODB_URI` has read/write on your Luca database.

---

## 5. Custom domain (`lucaai.app`)

1. Vercel → **Project → Settings → Domains** → Add `lucaai.app` and `www.lucaai.app`.
2. At **Name.com**, set DNS exactly as Vercel shows (often `A` for apex + `CNAME` for `www`, or Vercel nameservers).
3. When the domain is verified, set `NEXT_PUBLIC_APP_URL=https://lucaai.app` and redeploy.

Until DNS propagates, use the `*.vercel.app` URL and set `NEXT_PUBLIC_APP_URL` to that URL temporarily.

---

## 6. Smoke test

| Check | Expected |
|-------|----------|
| Home loads | Login/signup UI |
| Sign up / log in | Session cookie works |
| New chat | Gemini responds |
| Preview panel | Message that preview is not configured (OK for Phase 1) |

---

## 7. Phase 2 (later)

DigitalOcean droplet + `preview.lucaai.app` → set `PREVIEW_WORKER_URL=https://preview.lucaai.app` on Vercel. See [VERCEL.md](./VERCEL.md).

---

## Owner account on production

After first deploy, run provisioning **locally** against production MongoDB (one-time):

```powershell
# Use production MONGODB_URI in env for this command only — do not commit it
$env:MONGODB_URI="mongodb+srv://..."
npx tsx scripts/provision-owner.mts
```

Or sign up on the live site and upgrade plan via your billing scripts if you already use them locally.

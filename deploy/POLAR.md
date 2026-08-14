# Polar.sh billing

Luca uses [Polar](https://polar.sh) for Plus / Pro subscriptions.

## Environment variables

| Name | Required | Notes |
|------|----------|--------|
| `POLAR_ACCESS_TOKEN` | Yes | Organization access token from Polar dashboard |
| `POLAR_SERVER` | Yes | `sandbox` while testing, `production` when live |
| `POLAR_WEBHOOK_SECRET` | Yes (prod) | From Polar → Settings → Webhooks |
| `POLAR_PRODUCT_ID_PLUS` | Yes | Product UUID for Plus ($20/mo) |
| `POLAR_PRODUCT_ID_PRO` | Yes | Product UUID for Pro ($60/mo) |
| `NEXT_PUBLIC_APP_URL` | Yes | Used for checkout success/return URLs |

## 1. Create products in Polar

1. Polar dashboard → **Products** → create recurring monthly products:
   - **Luca Plus** — $20/month
   - **Luca Pro** — $60/month
2. Copy each product **ID** into env:
   - `POLAR_PRODUCT_ID_PLUS`
   - `POLAR_PRODUCT_ID_PRO`

## 2. Embedded checkout (Luca-branded page)

Upgrades go to **`/checkout?plan=plus`** or **`/checkout?plan=pro`** — a Luca-branded page with the payment form embedded inline.

In Polar dashboard → **Settings → Preferences → Embedding**, allow:

- `localhost:3000` (local dev)
- `lucaai.app` (production)

Without these hosts, the embedded payment panel will not load.

## 3. Redirect URLs

Checkout sessions use:

- Success: `{NEXT_PUBLIC_APP_URL}/billing?checkout=success`
- Return: `{NEXT_PUBLIC_APP_URL}/checkout?plan={planId}`

## 4. Webhook

1. Polar → **Settings → Webhooks** → Add endpoint:
   - **URL:** `https://lucaai.app/api/webhooks/polar`
   - Local dev: use [ngrok](https://ngrok.com) or Polar CLI to tunnel
2. Copy signing secret → `POLAR_WEBHOOK_SECRET`
3. Enable events:
   - `subscription.active`
   - `subscription.updated`
   - `subscription.canceled`
   - `subscription.revoked`
   - `subscription.uncanceled`

Webhooks map product IDs to Luca plans and update MongoDB.

## 5. Customer portal

Paid users open **Manage subscription** on `/billing` → `/api/billing/portal` (Polar customer portal).

Customers are linked by `customerExternalId` = Luca user id.

## 6. App routes

| Route | Purpose |
|-------|---------|
| `/billing` | Plans page |
| `/checkout?plan=plus\|pro` | Luca-branded checkout |
| `/api/billing/session` | Create Polar checkout session |
| `/api/billing/portal` | Manage subscription |
| `/api/webhooks/polar` | Subscription sync |

## 7. Local testing

```env
POLAR_SERVER=sandbox
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Without product IDs, dev mode applies plans directly (non-production only).

## 8. Go live

1. Switch `POLAR_SERVER=production`
2. Create production products and update product IDs
3. Set webhook URL on production domain
4. Redeploy Vercel with all Polar env vars

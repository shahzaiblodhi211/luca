# Zoho Mail — Luca auth emails

Luca sends **password reset** (link + 6-digit code), **welcome**, and **sign-in notice** emails from **`info@lucaai.app`** via SMTP.

## 1. Zoho (one time)

1. Log in to [Zoho Mail](https://mail.zoho.com) for **lucaai.app**.
2. **Settings → Mail Accounts → info@lucaai.app → Security** (or Zoho Account → **Security** → **App Passwords**).
3. Create an **application-specific password** for “Luca Vercel SMTP”. Copy it — you will not see it again.
4. Confirm **SMTP access** is enabled for the mailbox (Zoho Mail → Settings → Mail → POP/IMAP and SMTP).

Typical SMTP (custom domain):

| Setting | Value |
|--------|--------|
| Host | `smtppro.zoho.com` (or `smtp.zoho.com`) |
| Port | `465` (SSL) or `587` (TLS) |
| User | `info@lucaai.app` |
| Password | App password from step 3 |

If `smtppro.zoho.com` fails, try `smtp.zoho.com`.

## 2. Local (`.env.local`)

```env
SMTP_HOST=smtppro.zoho.com
SMTP_PORT=465
SMTP_SECURE=1
SMTP_USER=info@lucaai.app
SMTP_PASS=your-zoho-app-password

AUTH_EMAIL_FROM=luca Team <info@lucaai.app>
AUTH_EMAIL_REPLY_TO=info@lucaai.app
```

Restart `npm run dev`. Trigger **Forgot password** — without SMTP, the link and code are printed in the server console.

## 3. Vercel (production)

Add the same variables under **Project → Settings → Environment Variables** (Production).

Also set:

- `NEXT_PUBLIC_APP_URL=https://www.lucaai.app` (or your canonical URL) so reset links point to the live site.

Redeploy after saving.

## 4. Optional fallback

If `RESEND_API_KEY` is set, Luca tries **Zoho SMTP first**, then Resend if SMTP fails.

## 5. What users receive

| Event | Email |
|--------|--------|
| Forgot password | Reset button + **6-digit code** (1 hour) |
| Sign up | Welcome + sign-in link |
| Sign in | Security notice (time + IP if available) |

Reset code entry: `/reset-password` → **Reset code** tab.

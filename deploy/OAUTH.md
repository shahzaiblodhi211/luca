# OAuth sign-in (Google, GitHub, Apple)

Add these to **`.env.local`** and **Vercel → Environment Variables**.  
`NEXT_PUBLIC_APP_URL` must match the URL users open (e.g. `https://lucaai.app`) — redirect URIs are derived from it.

## Required (all providers)

| Variable | Notes |
|----------|--------|
| `AUTH_SECRET` | Already used for sessions (min 16 chars) |
| `NEXT_PUBLIC_APP_URL` | e.g. `https://lucaai.app` (no trailing slash) |

## Google

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → **OAuth consent screen** (External) → add scopes `email`, `profile`, `openid`.
2. **Credentials** → Create **OAuth client ID** → Web application.
3. **Authorized redirect URIs:**
   - `https://lucaai.app/api/auth/oauth/google/callback`
   - `http://localhost:3000/api/auth/oauth/google/callback` (local dev)

| Variable | Value |
|----------|--------|
| `GOOGLE_CLIENT_ID` | Client ID |
| `GOOGLE_CLIENT_SECRET` | Client secret |

## GitHub

1. GitHub → **Settings → Developer settings → OAuth Apps** → New OAuth App.
2. **Authorization callback URL:**
   - `https://lucaai.app/api/auth/oauth/github/callback`
   - (Add a second app or update URL when testing locally: `http://localhost:3000/api/auth/oauth/github/callback`)

| Variable | Value |
|----------|--------|
| `GITHUB_CLIENT_ID` | Client ID |
| `GITHUB_CLIENT_SECRET` | Client secret |

Enable email access: users need a verified email on GitHub; if email is private, grant the `user:email` scope (already requested).

## Apple (optional until you have an Apple Developer account)

1. [Apple Developer](https://developer.apple.com/) → **Identifiers** → Services ID for “Sign in with Apple”.
2. Configure **Return URLs:**
   - `https://lucaai.app/api/auth/oauth/apple/callback`
3. Create a **Sign in with Apple** key (.p8), note **Key ID** and **Team ID**.
4. `APPLE_CLIENT_ID` = Services ID (not the App ID bundle).

| Variable | Value |
|----------|--------|
| `APPLE_CLIENT_ID` | Services ID (e.g. `app.lucaai.signin`) |
| `APPLE_TEAM_ID` | 10-character Team ID |
| `APPLE_KEY_ID` | Key ID from .p8 key |
| `APPLE_PRIVATE_KEY` | Contents of `.p8` file — in env use `\n` for line breaks, or paste PEM on one line |

Until Apple vars are set, **Continue with Apple** redirects back with a clear “not configured” toast; Google/GitHub work when their vars are set.

## Local `.env.local` example

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Apple — leave empty until ready
APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=
```

Redeploy after changing env on Vercel.

## Behaviour

- **Sign up** modal → OAuth creates a new user (or links provider to existing email).
- **Sign in** modal → OAuth only logs in existing users (by provider id or linked email); otherwise error asking to sign up first.
- Email/password accounts can link a provider on first OAuth use with the same email.

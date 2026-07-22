# Luca AI

**Luca AI** is a generative UI builder by **Luca Technology**. Describe a site or app, attach a screenshot or URL, and Luca AI ships a live Next.js preview with Awwwards-caliber craft.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Configure Gemini keys in `.env.local` (`GEMINI_API_KEY_1` … `GEMINI_API_KEY_500`, and/or `GEMINI_API_KEYS`, and/or `GEMINI_API_KEYS_FILE` for one key per line). Luca rotates across the pool on 429/quota.

Switch providers in `.env.local` with `AI_PROVIDER` (restart dev after change):

| Value | Behavior |
|-------|----------|
| `gemini` | Google AI Studio keys only |
| `puter` | Puter only (`PUTER_AUTH_TOKEN` from [dashboard](https://puter.com/dashboard)) |
| `auto` | Gemini first → Puter if Gemini fails |
| `puter-first` | Puter first → Gemini if Puter fails |

## Stack

- Next.js App Router + Tailwind CSS v4
- Tool-calling agent (`Prompt.md`) → live preview workspaces
- Built by [Luca Technology](.)

## License

Private — Luca Technology.

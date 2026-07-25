# Luca AI

**Luca AI** is a generative UI builder by **Luca Technology**. Describe a site or app, attach a screenshot or URL, and Luca AI ships a live Next.js preview with Awwwards-caliber craft.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Production:** [deploy/VERCEL.md](deploy/VERCEL.md) (Vercel + `preview.lucaai.app` on DO) · [deploy/README.md](deploy/README.md) (single-server option)

Configure Gemini keys in `.env.local` (`GEMINI_API_KEY_1` … `GEMINI_API_KEY_500`, and/or `GEMINI_API_KEYS`, and/or `GEMINI_API_KEYS_FILE` for one key per line). Set `GEMINI_MODEL` for the chat model. Luca rotates across the pool on 429/503/quota.

## Stack

- Next.js App Router + Tailwind CSS v4
- Google AI Studio tool-calling agent (`Prompt.md`) → live preview workspaces
- Built by [Luca Technology](.)

## License

Private — Luca Technology.

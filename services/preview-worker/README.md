# Luca preview worker

Runs on the **same machine** as the main app (not on Vercel).

- `POST/GET/DELETE /api/preview` — sync workspaces + spawn `next dev`
- `/_preview/:port/*` — reverse proxy to loopback preview servers

From **repo root**:

```bash
npm run preview-worker
```

See [deploy/README.md](../../deploy/README.md).

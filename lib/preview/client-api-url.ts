/** Browser → preview API (Vercel proxies to worker when server has PREVIEW_WORKER_URL). */
export function previewApiUrl(): string {
  const direct = process.env.NEXT_PUBLIC_PREVIEW_API_URL?.trim();
  if (direct) return direct.replace(/\/+$/, "");
  return "/api/preview";
}

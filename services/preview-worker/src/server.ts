/**
 * Preview worker — same host as Luca (e.g. DigitalOcean).
 * - POST/GET/DELETE /api/preview
 * - GET /p/:chatId/* → loopback Next dev (wakes if asleep)
 *
 * Run from repo root: npm run preview-worker
 */
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import https from "node:https";
import httpProxy from "http-proxy";
import {
  runPreviewDelete,
  runPreviewGet,
  runPreviewPost,
  type PreviewPostBody,
} from "@/lib/preview/run-preview-request";
import { ensurePreviewServer } from "@/lib/preview/server-manager";
import { withLock } from "@/lib/preview/mutex";
import {
  sanitizeChatId,
  workspaceExists,
} from "@/lib/preview/paths";
import {
  matchPublicPreviewPath,
  previewBasePathForChat,
  rewritePreviewUpstreamPath,
} from "@/lib/preview/public-url";

const PORT = Number(process.env.PREVIEW_WORKER_PORT ?? 3001);
const HOST = process.env.PREVIEW_WORKER_HOST ?? "127.0.0.1";

const wsProxy = httpProxy.createProxyServer({ ws: true, xfwd: true });

wsProxy.on("error", (err, _req, socket) => {
  console.error("[preview-worker] ws proxy", err.message);
  if (socket && "destroy" in socket) socket.destroy();
});

function lucaAppOrigin(): string {
  return (
    process.env.LUCA_APP_ORIGIN?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    ""
  ).replace(/\/+$/, "");
}

function corsOrigin(req: IncomingMessage): string | null {
  const raw = process.env.PREVIEW_CORS_ORIGINS?.trim();
  if (!raw) return null;
  const allowed = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (!origin || !allowed.includes(origin)) return null;
  return origin;
}

function applyCors(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = corsOrigin(req);
  if (req.method === "OPTIONS") {
    if (origin) {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      });
    } else {
      res.writeHead(204);
    }
    res.end();
    return true;
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  return false;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function rewritePreviewHeaders(
  chatId: string,
  headers: IncomingMessage["headers"],
): IncomingMessage["headers"] {
  const base = previewBasePathForChat(chatId);
  if (!base) return headers;
  const out = { ...headers };
  const loc = out.location;
  const raw = Array.isArray(loc) ? loc[0] : loc;
  if (typeof raw === "string" && raw.startsWith("/") && !raw.startsWith(base)) {
    out.location = `${base}${raw === "/" ? "" : raw}`;
  }
  return out;
}

function proxyToPreviewPort(
  req: IncomingMessage,
  res: ServerResponse,
  port: number,
  chatId: string,
  search: string,
) {
  const headers = { ...req.headers, host: `127.0.0.1:${port}` };
  const upstream = httpRequest(
    {
      hostname: "127.0.0.1",
      port,
      path: `${rewritePreviewUpstreamPath(req.url?.split("?")[0] || "/", chatId)}${search}`,
      method: req.method,
      headers,
    },
    (pres) => {
      const outHeaders = rewritePreviewHeaders(chatId, pres.headers);
      res.writeHead(pres.statusCode ?? 502, outHeaders);
      pres.pipe(res);
    },
  );
  upstream.on("error", (err) => {
    json(res, 502, {
      error: err instanceof Error ? err.message : "Preview proxy failed",
    });
  });
  req.pipe(upstream);
}

function proxyToLucaApp(
  req: IncomingMessage,
  res: ServerResponse,
  pathWithSearch: string,
) {
  const origin = lucaAppOrigin();
  if (!origin) {
    json(res, 502, { error: "LUCA_APP_ORIGIN not configured" });
    return;
  }
  const target = new URL(pathWithSearch, `${origin}/`);
  const headers = { ...req.headers, host: target.host };
  const requestFn =
    target.protocol === "https:"
      ? https.request.bind(https)
      : httpRequest;
  const upstream = requestFn(
    {
      hostname: target.hostname,
      port: target.port || (target.protocol === "https:" ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method: req.method,
      headers,
    },
    (pres) => {
      res.writeHead(pres.statusCode ?? 502, pres.headers);
      pres.pipe(res);
    },
  );
  upstream.on("error", (err) => {
    json(res, 502, {
      error: err instanceof Error ? err.message : "Luca app proxy failed",
    });
  });
  req.pipe(upstream);
}

const server = createServer(async (req, res) => {
  try {
    if (applyCors(req, res)) return;

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "local"}`);
    const pathname = url.pathname;

    if (pathname.startsWith("/api/images/")) {
      proxyToLucaApp(req, res, `${pathname}${url.search}`);
      return;
    }

    const previewImages = matchPublicPreviewPath(pathname);
    if (previewImages?.rest.startsWith("/api/images/")) {
      proxyToLucaApp(
        req,
        res,
        `/api/images/${previewImages.rest.slice("/api/images/".length)}${url.search}`,
      );
      return;
    }

    const previewProxy = matchPublicPreviewPath(pathname);
    if (previewProxy) {
      let chatId: string;
      try {
        chatId = sanitizeChatId(previewProxy.chatId);
      } catch {
        json(res, 400, { error: "Invalid preview" });
        return;
      }
      if (!workspaceExists(chatId)) {
        json(res, 404, { error: "Preview is not available yet." });
        return;
      }
      const server = await withLock(`preview:${chatId}`, () =>
        ensurePreviewServer(chatId),
      );
      proxyToPreviewPort(req, res, server.port, chatId, url.search);
      return;
    }

    if (pathname === "/api/preview" || pathname === "/api/preview/") {
      if (req.method === "GET") {
        const out = runPreviewGet(url.searchParams.get("chatId"));
        json(res, out.status, out.json);
        return;
      }
      if (req.method === "DELETE") {
        const out = await runPreviewDelete(url.searchParams.get("chatId"));
        json(res, out.status, out.json);
        return;
      }
      if (req.method === "POST") {
        const raw = await readBody(req);
        let body: PreviewPostBody;
        try {
          body = JSON.parse(raw || "{}") as PreviewPostBody;
        } catch {
          json(res, 400, { error: "Invalid JSON" });
          return;
        }
        const out = await runPreviewPost(body);
        json(res, out.status, out.json);
        return;
      }
    }

    if (pathname === "/health") {
      json(res, 200, { ok: true, service: "luca-preview-worker" });
      return;
    }

    json(res, 404, { error: "Not found" });
  } catch (err) {
    console.error("[preview-worker]", err);
    json(res, 500, {
      error: err instanceof Error ? err.message : "Internal error",
    });
  }
});

server.on("upgrade", (req, socket, head) => {
  void (async () => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "local"}`);
    const previewProxy = matchPublicPreviewPath(url.pathname);
    if (!previewProxy) {
      socket.destroy();
      return;
    }
    let chatId: string;
    try {
      chatId = sanitizeChatId(previewProxy.chatId);
    } catch {
      socket.destroy();
      return;
    }
    if (!workspaceExists(chatId)) {
      socket.destroy();
      return;
    }
    const server = await withLock(`preview:${chatId}`, () =>
      ensurePreviewServer(chatId),
    );
    req.url = `${rewritePreviewUpstreamPath(url.pathname, chatId)}${url.search}`;
    wsProxy.ws(
      req,
      socket,
      head,
      { target: `http://127.0.0.1:${server.port}`, changeOrigin: true },
      (err) => {
        console.error("[preview-worker] upgrade", err?.message);
        socket.destroy();
      },
    );
  })().catch(() => {
    socket.destroy();
  });
});

server.listen(PORT, HOST, () => {
  console.info(`[preview-worker] http://${HOST}:${PORT}`);
  console.info("[preview-worker] preview links stay up — processes reattach or wake on request");
});

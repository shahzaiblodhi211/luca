import { spawn, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import path from "node:path";
import {
  PREVIEW_RUNTIME_DIR,
  sanitizeChatId,
  workspaceDirFor,
} from "./paths";
import { patchWorkspacePreviewBasePath } from "./layout-preview-base";
import {
  previewBasePathForChat,
  previewInternalOrigin,
  previewReadyCheckUrl,
} from "./public-url";

export type PreviewServerInfo = {
  chatId: string;
  port: number;
  url: string;
  pid: number | null;
  status: "starting" | "ready" | "error";
  error?: string;
  startedAt: number;
};

type Managed = {
  info: PreviewServerInfo;
  child: ChildProcess | null;
  logs: string[];
};

type PersistedServer = {
  chatId: string;
  port: number;
  pid: number;
  startedAt: number;
  basePath?: string | null;
};

const servers = new Map<string, Managed>();
const PORT_START = 4100;
const PORT_END = 4199;

function previewLoopbackUrl(port: number): string {
  return previewInternalOrigin(port);
}

function persistPath(chatId: string): string {
  return path.join(PREVIEW_RUNTIME_DIR, "servers", `${chatId}.json`);
}

function readPersisted(chatId: string): PersistedServer | null {
  try {
    const p = persistPath(chatId);
    if (!existsSync(p)) return null;
    const data = JSON.parse(readFileSync(p, "utf8")) as PersistedServer;
    if (!data?.port || !data?.pid) return null;
    return data;
  } catch {
    return null;
  }
}

function writePersisted(info: PersistedServer) {
  const dir = path.join(PREVIEW_RUNTIME_DIR, "servers");
  mkdirSync(dir, { recursive: true });
  writeFileSync(persistPath(info.chatId), JSON.stringify(info), "utf8");
}

function clearPersisted(chatId: string) {
  try {
    unlinkSync(persistPath(chatId));
  } catch {
    /* ignore */
  }
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", () => resolve(false));
    srv.listen(port, "127.0.0.1", () => {
      srv.close(() => resolve(true));
    });
  });
}

async function findFreePort(prefer?: number): Promise<number> {
  const used = new Set([...servers.values()].map((s) => s.info.port));
  if (
    prefer &&
    prefer >= PORT_START &&
    prefer <= PORT_END &&
    !used.has(prefer) &&
    (await isPortFree(prefer))
  ) {
    return prefer;
  }
  for (let port = PORT_START; port <= PORT_END; port++) {
    if (used.has(port)) continue;
    if (await isPortFree(port)) return port;
  }
  throw new Error("No free preview ports (4100–4199)");
}

async function httpOk(url: string, timeoutMs = 1500): Promise<boolean> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "manual",
    });
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}

async function waitForReady(
  port: number,
  chatId: string,
  timeoutMs = 120_000,
): Promise<void> {
  const start = Date.now();
  const url = previewReadyCheckUrl(port, chatId);
  while (Date.now() - start < timeoutMs) {
    if (await httpOk(url, 3000)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Preview server on :${port} did not become ready in time`);
}

async function killPid(pid: number): Promise<void> {
  if (!pid || pid <= 0) return;
  try {
    if (process.platform === "win32") {
      await new Promise<void>((resolve) => {
        const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
          stdio: "ignore",
          shell: true,
          windowsHide: true,
        });
        killer.on("close", () => resolve());
        killer.on("error", () => resolve());
      });
    } else {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, 400));
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

async function killManaged(managed: Managed) {
  const child = managed.child;
  managed.child = null;
  const pid = child?.pid ?? managed.info.pid;
  if (pid) await killPid(pid);
  clearPersisted(managed.info.chatId);
}

/** Next 16 refuses a second `next dev` for the same dir — kill the lock holder. */
function parseAlreadyRunningPid(logs: string): number | null {
  const m = logs.match(
    /Another next dev server is already running[\s\S]*?- PID:\s*(\d+)/i,
  );
  if (!m) return null;
  const pid = Number(m[1]);
  return Number.isFinite(pid) ? pid : null;
}

async function killWorkspaceOrphans(chatId: string): Promise<void> {
  const persisted = readPersisted(chatId);
  if (persisted?.pid) {
    console.info(
      `[preview] killing persisted orphan pid=${persisted.pid} :${persisted.port}`,
    );
    await killPid(persisted.pid);
    clearPersisted(chatId);
    await new Promise((r) => setTimeout(r, 600));
  }

  for (const file of [
    path.join(workspaceDirFor(chatId), ".next", "dev", "lock"),
    path.join(workspaceDirFor(chatId), ".next", "lock"),
  ]) {
    try {
      if (existsSync(file)) unlinkSync(file);
    } catch {
      /* ignore */
    }
  }
}

function nextBinPath(): string {
  return path.join(
    PREVIEW_RUNTIME_DIR,
    "node_modules",
    "next",
    "dist",
    "bin",
    "next",
  );
}

/** Parent `next dev` may set TURBOPACK=*; preview runs `next dev --webpack` and must not inherit both. */
function envForPreviewDev(
  base: NodeJS.ProcessEnv,
  previewBasePath?: string,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  for (const key of [
    "TURBOPACK",
    "NEXT_TURBOPACK",
    "NEXT_PRIVATE_TURBOPACK",
  ]) {
    delete env[key];
  }
  return {
    ...env,
    BROWSER: "none",
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: "development",
    ...(previewBasePath
      ? { LUCA_PREVIEW_BASE_PATH: previewBasePath }
      : {}),
  };
}

async function startProcess(
  chatId: string,
  port: number,
  allowLockRetry = true,
): Promise<Managed> {
  const cwd = workspaceDirFor(chatId);
  const bin = nextBinPath();
  const previewBasePath = previewBasePathForChat(chatId);
  await patchWorkspacePreviewBasePath(chatId, previewBasePath);

  const child = spawn(
    process.execPath,
    [bin, "dev", "--webpack", "--port", String(port), "--hostname", "127.0.0.1"],
    {
      cwd,
      env: envForPreviewDev(process.env, previewBasePath ?? undefined),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );

  const managed: Managed = {
    child,
    logs: [],
    info: {
      chatId,
      port,
      url: previewLoopbackUrl(port),
      pid: child.pid ?? null,
      status: "starting",
      startedAt: Date.now(),
    },
  };

  const pushLog = (chunk: Buffer) => {
    const text = chunk.toString();
    managed.logs.push(text);
    if (managed.logs.length > 80) managed.logs.shift();
  };
  child.stdout?.on("data", pushLog);
  child.stderr?.on("data", pushLog);

  child.on("exit", (code) => {
    const current = servers.get(chatId);
    if (current?.child === child) {
      current.info.status = "error";
      current.info.error = `Preview process exited (${code})`;
      current.child = null;
      clearPersisted(chatId);
    }
  });

  servers.set(chatId, managed);

  try {
    await waitForReady(port, chatId);
    managed.info.status = "ready";
    if (managed.info.pid) {
      writePersisted({
        chatId,
        port,
        pid: managed.info.pid,
        startedAt: managed.info.startedAt,
        basePath: previewBasePath,
      });
    }
    return managed;
  } catch (err) {
    const tail = managed.logs.join("");
    const orphanPid = parseAlreadyRunningPid(tail);
    managed.info.status = "error";
    managed.info.error =
      err instanceof Error ? err.message : "Failed to start preview";
    if (tail.slice(-1500)) managed.info.error += `\n${tail.slice(-1500)}`;

    await killManaged(managed);
    servers.delete(chatId);

    if (allowLockRetry && orphanPid) {
      console.info(
        `[preview] next lock held by pid=${orphanPid} — killing and retrying`,
      );
      await killPid(orphanPid);
      await new Promise((r) => setTimeout(r, 800));
      const retryPort = await findFreePort(port);
      return startProcess(chatId, retryPort, false);
    }

    throw new Error(managed.info.error);
  }
}

export function getPreviewServer(chatId: string): PreviewServerInfo | null {
  const id = sanitizeChatId(chatId);
  return servers.get(id)?.info ?? null;
}

export async function stopPreviewServer(chatId: string): Promise<void> {
  const id = sanitizeChatId(chatId);
  const managed = servers.get(id);
  if (managed) {
    await killManaged(managed);
    servers.delete(id);
    return;
  }
  await killWorkspaceOrphans(id);
}

/**
 * Ensure a Next.js dev server is running for this chat workspace.
 * Restarts if the process died; reuses healthy servers.
 * Survives parent HMR by persisting pid/port to disk.
 */
export async function ensurePreviewServer(
  chatId: string,
  opts?: { restart?: boolean },
): Promise<PreviewServerInfo> {
  const id = sanitizeChatId(chatId);
  const existing = servers.get(id);

  if (existing && !opts?.restart) {
    if (existing.info.status === "ready") {
      if (await httpOk(previewReadyCheckUrl(existing.info.port, id)))
        return existing.info;
    }
    await killManaged(existing);
    servers.delete(id);
  } else if (existing && opts?.restart) {
    await killManaged(existing);
    servers.delete(id);
  }

  if (!opts?.restart) {
    const persisted = readPersisted(id);
    if (persisted) {
      const expectedBase = previewBasePathForChat(id);
      const url = previewReadyCheckUrl(persisted.port, id);
      const alive = await httpOk(url);
      if (alive) {
        const sameBase =
          (persisted.basePath ?? null) === (expectedBase ?? null);
        if (sameBase) {
          const info: PreviewServerInfo = {
            chatId: id,
            port: persisted.port,
            url: previewLoopbackUrl(persisted.port),
            pid: persisted.pid,
            status: "ready",
            startedAt: persisted.startedAt,
          };
          servers.set(id, { info, child: null, logs: [] });
          console.info(
            `[preview] reattached ${id} :${persisted.port} pid=${persisted.pid}`,
          );
          return info;
        }
        console.info(
          `[preview] restarting ${id} — preview URL path changed`,
        );
        await killPid(persisted.pid);
        clearPersisted(id);
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }

  await killWorkspaceOrphans(id);
  const port = await findFreePort();
  const managed = await startProcess(id, port);
  return managed.info;
}

/** Kill persisted preview dev PIDs (e.g. after worker redeploy). */
export async function killAllStalePreviewDevServers(): Promise<void> {
  const dir = path.join(PREVIEW_RUNTIME_DIR, "servers");
  try {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      try {
        const data = JSON.parse(
          readFileSync(path.join(dir, file), "utf8"),
        ) as PersistedServer;
        if (data?.pid) await killPid(data.pid);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* no servers dir */
  }
}

import { createHash } from "crypto";
import { readFileSync, statSync, writeFileSync } from "fs";
import { isAbsolute, resolve } from "path";

const RETRYABLE_STATUS = new Set([403, 429, 500, 502, 503, 504]);

/** Separate pools so chat and image rotate independently. */
export type GeminiKeyPool = "chat" | "image";

/** Max keys loaded from env / file (GEMINI_API_KEY_1…N + GEMINI_API_KEYS). */
export const MAX_GEMINI_KEYS = 500;

/** Skip a key for this long after a short RPM 429 (~1 minute window). */
const HOT_MS_RPM = 55_000;

/** Soft skip after 503 / high-demand — keep tiny so the next key is tried immediately. */
const HOT_MS_SOFT = 1_500;

/** Daily / billing quota — don't retry until next UTC day (plus buffer). */
const HOT_MS_DAILY_MAX = 24 * 60 * 60_000;

/** Extra buffer after hotUntil before we reuse a key. */
const COOL_BUFFER_MS = 1_500;

const STATE_FILE = ".gemini-key-state.json";

function msUntilNextUtcMidnight(): number {
  const now = new Date();
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      1,
      0,
    ),
  );
  return Math.min(
    HOT_MS_DAILY_MAX,
    Math.max(HOT_MS_RPM, next.getTime() - now.getTime()),
  );
}

/** True when the error is daily/billing quota (not a brief RPM blip). */
export function isDailyQuotaMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("billing") ||
    lower.includes("plan and billing") ||
    lower.includes("exceeded your current quota") ||
    lower.includes("quota exceeded") ||
    lower.includes("daily") ||
    lower.includes("per day") ||
    lower.includes("rpd") ||
    lower.includes("perday") ||
    lower.includes("free_tier") ||
    lower.includes("free tier") ||
    /generaterequestsperday/i.test(message) ||
    /limit:\s*0\b/i.test(message)
  );
}

/** Plain-language error for the chat UI (never dump raw Gemini JSON). */
export function formatGeminiUserError(message: string): string {
  if (
    /\b429\b/.test(message) ||
    /resource_exhausted|resource has been exhausted|too many requests|quota/i.test(
      message,
    )
  ) {
    if (isDailyQuotaMessage(message)) {
      return "Gemini daily quota is used up on the available API keys. Try again after UTC midnight, or add fresh keys.";
    }
    return "Gemini is rate-limiting the available API keys right now. Wait about a minute and try again.";
  }
  if (/\b503\b/.test(message) || /high demand|overloaded/i.test(message)) {
    return "Gemini is overloaded right now. Try again in a moment.";
  }
  // Strip nested JSON noise if present
  const brief = message.replace(/\s+/g, " ").trim();
  if (brief.length > 220) return `${brief.slice(0, 200)}…`;
  return brief;
}

/** 503 / high-demand — soft-skip this key and try the rest of the pool. */
export function isCapacityMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    /\b503\b/.test(message) ||
    lower.includes("high demand") ||
    lower.includes("overloaded") ||
    lower.includes("unavailable") ||
    lower.includes("temporarily")
  );
}

function fingerprint(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

type KeyState = {
  /** Round-robin cursor (next key to try) */
  current: number;
  /** keyIndex → timestamp until which we skip this key */
  hotUntil: Map<number, number>;
};

type PersistedPool = {
  currentFp?: string;
  hot: Record<string, number>;
};

type PersistedFile = {
  chat: PersistedPool;
  image: PersistedPool;
};

declare global {
  // eslint-disable-next-line no-var
  var _geminiKeyPools: Record<GeminiKeyPool, KeyState> | undefined;
  // eslint-disable-next-line no-var
  var _geminiKeysCache: string[] | undefined;
  // eslint-disable-next-line no-var
  var _geminiKeyFps: string[] | undefined;
  // eslint-disable-next-line no-var
  var _geminiInFlight: Record<GeminiKeyPool, Set<number>> | undefined;
  // eslint-disable-next-line no-var
  var _geminiHotHydrated: boolean | undefined;
  // eslint-disable-next-line no-var
  var _geminiKeysFilePath: string | undefined;
  // eslint-disable-next-line no-var
  var _geminiKeysFileMtime: number | undefined;
}

function ensurePool(
  state: Partial<KeyState> & { index?: number } | undefined,
): KeyState {
  const hotUntil =
    state?.hotUntil instanceof Map ? state.hotUntil : new Map<number, number>();
  const current =
    typeof state?.current === "number"
      ? state.current
      : typeof state?.index === "number"
        ? state.index
        : 0;
  return { current, hotUntil };
}

function poolState(pool: GeminiKeyPool): KeyState {
  if (!global._geminiKeyPools) {
    global._geminiKeyPools = {
      chat: { current: 0, hotUntil: new Map() },
      image: { current: 0, hotUntil: new Map() },
    };
  } else {
    global._geminiKeyPools.chat = ensurePool(global._geminiKeyPools.chat);
    global._geminiKeyPools.image = ensurePool(global._geminiKeyPools.image);
  }
  return global._geminiKeyPools[pool];
}

function inFlight(pool: GeminiKeyPool): Set<number> {
  if (!global._geminiInFlight) {
    global._geminiInFlight = {
      chat: new Set(),
      image: new Set(),
    };
  }
  return global._geminiInFlight[pool];
}

function stateFilePath(): string {
  return resolve(process.cwd(), STATE_FILE);
}

function loadPersisted(): PersistedFile {
  try {
    const raw = readFileSync(stateFilePath(), "utf8");
    const parsed = JSON.parse(raw) as PersistedFile;
    return {
      chat: { hot: parsed.chat?.hot ?? {}, currentFp: parsed.chat?.currentFp },
      image: {
        hot: parsed.image?.hot ?? {},
        currentFp: parsed.image?.currentFp,
      },
    };
  } catch {
    return { chat: { hot: {} }, image: { hot: {} } };
  }
}

function savePersisted(): void {
  try {
    const keys = getGeminiKeys();
    const fps = global._geminiKeyFps || keys.map(fingerprint);
    const pack = (pool: GeminiKeyPool): PersistedPool => {
      const state = poolState(pool);
      const hot: Record<string, number> = {};
      const now = Date.now();
      for (const [idx, until] of state.hotUntil) {
        if (until > now && fps[idx]) hot[fps[idx]] = until;
      }
      return {
        currentFp: fps[state.current],
        hot,
      };
    };
    const body: PersistedFile = { chat: pack("chat"), image: pack("image") };
    writeFileSync(stateFilePath(), `${JSON.stringify(body, null, 2)}\n`, "utf8");
  } catch (err) {
    console.warn(
      "[gemini-keys] failed to persist hot state:",
      err instanceof Error ? err.message : err,
    );
  }
}

function keysFileMeta(): { abs: string | null; mtime: number } {
  const filePath = process.env.GEMINI_API_KEYS_FILE?.trim();
  if (!filePath) return { abs: null, mtime: 0 };
  const abs = isAbsolute(filePath)
    ? filePath
    : resolve(process.cwd(), filePath);
  try {
    return { abs, mtime: statSync(abs).mtimeMs };
  } catch {
    return { abs, mtime: 0 };
  }
}

/** Remap in-memory hot maps from old key order → new key order (by fingerprint). */
function remapHotToNewFps(oldFps: string[], newFps: string[]): void {
  const now = Date.now();
  for (const pool of ["chat", "image"] as GeminiKeyPool[]) {
    const state = poolState(pool);
    const byFp = new Map<string, number>();
    for (const [idx, until] of state.hotUntil) {
      const fp = oldFps[idx];
      if (!fp || until <= now) continue;
      byFp.set(fp, until);
    }
    const currentFp = oldFps[state.current];
    state.hotUntil.clear();
    for (let i = 0; i < newFps.length; i++) {
      const until = byFp.get(newFps[i]);
      if (until) state.hotUntil.set(i, until);
    }
    if (currentFp) {
      const idx = newFps.indexOf(currentFp);
      if (idx >= 0) state.current = idx;
      else state.current = state.current % Math.max(1, newFps.length);
    }
  }
}

/** Load / merge fingerprint-keyed hot state from disk (per pool). */
function hydrateHotFromDisk(fps: string[], mode: "replace" | "merge"): void {
  const persisted = loadPersisted();
  const now = Date.now();

  for (const pool of ["chat", "image"] as GeminiKeyPool[]) {
    const state = poolState(pool);
    const data = persisted[pool];
    if (mode === "replace") state.hotUntil.clear();

    let restored = 0;
    for (let i = 0; i < fps.length; i++) {
      const until = data.hot?.[fps[i]];
      if (typeof until !== "number" || until <= now) continue;
      const prev = state.hotUntil.get(i) || 0;
      if (until > prev) {
        state.hotUntil.set(i, until);
        restored += 1;
      }
    }
    if (data.currentFp) {
      const idx = fps.indexOf(data.currentFp);
      if (idx >= 0) state.current = idx;
    }
    if (restored && mode === "replace") {
      console.info(
        `[gemini-keys] restored ${restored} hot ${pool} key(s) from ${STATE_FILE}`,
      );
    }
  }
  global._geminiHotHydrated = true;
}

function loadKeysFromConfig(): {
  keys: string[];
  fileAbs: string | null;
  fileMtime: number;
} {
  const numbered: string[] = [];
  for (let i = 1; i <= MAX_GEMINI_KEYS; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`]?.trim();
    if (k) numbered.push(k);
  }

  const csv = (process.env.GEMINI_API_KEYS || "")
    .split(/[,;\s]+/)
    .map((k) => k.trim())
    .filter(Boolean);

  let fromFile: string[] = [];
  const meta = keysFileMeta();
  if (meta.abs) {
    try {
      const raw = readFileSync(meta.abs, "utf8");
      fromFile = raw
        .split(/\r?\n/)
        .map((line) => line.replace(/#.*$/, "").trim())
        .filter(Boolean);
    } catch (err) {
      console.warn(
        `[gemini-keys] GEMINI_API_KEYS_FILE unreadable (${meta.abs}):`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const seen = new Set<string>();
  const keys: string[] = [];
  for (const k of [...numbered, ...csv, ...fromFile]) {
    if (seen.has(k)) continue;
    seen.add(k);
    keys.push(k);
    if (keys.length >= MAX_GEMINI_KEYS) break;
  }

  if (keys.length === 0) {
    throw new Error(
      "No Gemini API keys configured (GEMINI_API_KEY_1…N, GEMINI_API_KEYS, and/or GEMINI_API_KEYS_FILE)",
    );
  }

  return { keys, fileAbs: meta.abs, fileMtime: meta.mtime };
}

/**
 * Load all configured keys (up to {@link MAX_GEMINI_KEYS}):
 * - GEMINI_API_KEY_1 … GEMINI_API_KEY_500
 * - and/or GEMINI_API_KEYS=keyA,keyB,… (comma / semicolon / whitespace)
 * - and/or GEMINI_API_KEYS_FILE=path/to/keys.txt (one key per line)
 *
 * Reloads when the keys file mtime changes (dev servers keep a stale cache otherwise).
 */
export function getGeminiKeys(): string[] {
  const meta = keysFileMeta();
  const cached = global._geminiKeysCache;
  const fileChanged =
    !!meta.abs &&
    (global._geminiKeysFilePath !== meta.abs ||
      global._geminiKeysFileMtime !== meta.mtime);

  if (cached?.length && !fileChanged) {
    return cached;
  }

  const prevLen = cached?.length || 0;
  const oldFps = global._geminiKeyFps;
  const { keys, fileAbs, fileMtime } = loadKeysFromConfig();
  const fps = keys.map(fingerprint);

  if (oldFps?.length && (prevLen !== keys.length || fileChanged)) {
    remapHotToNewFps(oldFps, fps);
  }

  global._geminiKeysCache = keys;
  global._geminiKeyFps = fps;
  global._geminiKeysFilePath = fileAbs || undefined;
  global._geminiKeysFileMtime = fileMtime;

  if (!global._geminiHotHydrated) {
    hydrateHotFromDisk(fps, "replace");
  } else if (fileChanged || prevLen !== keys.length) {
    hydrateHotFromDisk(fps, "merge");
  }

  if (prevLen && prevLen !== keys.length) {
    console.info(
      `[gemini-keys] reloaded pool ${prevLen} → ${keys.length} key(s)`,
    );
  } else if (keys.length > 1 && !prevLen) {
    console.info(`[gemini-keys] loaded ${keys.length} key(s) for rotation`);
  }

  return keys;
}

/** Cool / hot counts for logging. */
export function geminiKeyPoolStats(pool: GeminiKeyPool): {
  total: number;
  cool: number;
  hot: number;
  inFlight: number;
} {
  const keys = getGeminiKeys();
  let cool = 0;
  let hot = 0;
  let flying = 0;
  for (let i = 0; i < keys.length; i++) {
    if (inFlight(pool).has(i)) flying += 1;
    if (isHot(pool, i)) hot += 1;
    else if (!inFlight(pool).has(i)) cool += 1;
  }
  return { total: keys.length, cool, hot, inFlight: flying };
}

function isBusy(pool: GeminiKeyPool, keyIndex: number): boolean {
  return isHot(pool, keyIndex) || inFlight(pool).has(keyIndex);
}

function isHot(pool: GeminiKeyPool, keyIndex: number): boolean {
  getGeminiKeys(); // ensure hydrated
  const until = poolState(pool).hotUntil.get(keyIndex) || 0;
  return Date.now() < until;
}

/** Mark key rate-limited — round-robin cursor moves past it. */
export function markGeminiKeyHot(
  pool: GeminiKeyPool,
  keyIndex: number,
  opts?: { daily?: boolean; message?: string; ms?: number },
): void {
  const keys = getGeminiKeys();
  const state = poolState(pool);
  const daily =
    opts?.daily === true ||
    (opts?.message ? isDailyQuotaMessage(opts.message) : false);
  const soft =
    !daily &&
    (typeof opts?.ms === "number" ||
      (opts?.message ? isCapacityMessage(opts.message) : false));
  const hotMs =
    typeof opts?.ms === "number"
      ? opts.ms
      : daily
        ? msUntilNextUtcMidnight()
        : soft
          ? HOT_MS_SOFT
          : HOT_MS_RPM;
  const reason = daily ? "daily/quota" : soft ? "capacity" : "rpm";
  state.hotUntil.set(keyIndex, Date.now() + hotMs);
  state.current = (keyIndex + 1) % keys.length;
  inFlight(pool).delete(keyIndex);
  // Soft capacity skips are short-lived — don't persist to disk
  if (!soft) savePersisted();
  console.info(
    `[gemini-keys] key#${keyIndex + 1}/${keys.length} hot (~${Math.round(hotMs / 1000)}s, ${reason}) — next → key#${state.current + 1}`,
  );
}

/** Ms until the soonest key is cool again (0 if any key is already cool). */
export function msUntilCoolGeminiKey(pool: GeminiKeyPool): number {
  const keys = getGeminiKeys();
  const now = Date.now();
  let soonest = Infinity;
  for (let i = 0; i < keys.length; i++) {
    const until = poolState(pool).hotUntil.get(i) || 0;
    if (until <= now && !inFlight(pool).has(i)) return 0;
    if (until < soonest) soonest = until;
  }
  if (!Number.isFinite(soonest)) return 0;
  return Math.max(0, soonest - now + COOL_BUFFER_MS);
}

/**
 * When every key is RPM-hot, wait for the oldest to cool.
 * Caps a single wait at ~RPM window so we don't hang forever on daily quota.
 */
export async function waitForCoolGeminiKey(
  pool: GeminiKeyPool,
): Promise<number> {
  const waitMs = msUntilCoolGeminiKey(pool);
  if (waitMs <= 0) return 0;
  const capped = Math.min(waitMs, HOT_MS_RPM + COOL_BUFFER_MS);
  console.info(
    `[gemini-keys] all keys hot — waiting ${Math.ceil(capped / 1000)}s for next cool key`,
  );
  await new Promise((r) => setTimeout(r, capped));
  return capped;
}

/**
 * Sticky pick: reuse the current cool key until it fails (fast path).
 * On hot/in-flight, jump to the next cool key immediately — no waiting.
 */
export function pickGeminiKeyIndex(pool: GeminiKeyPool): number {
  const keys = getGeminiKeys();
  const state = poolState(pool);
  const n = keys.length;
  const start = ((state.current % n) + n) % n;
  const busy = inFlight(pool);

  for (let offset = 0; offset < n; offset++) {
    const idx = (start + offset) % n;
    if (!isHot(pool, idx) && !busy.has(idx)) {
      // Stick here until markGeminiKeyHot advances past a failure
      state.current = idx;
      busy.add(idx);
      return idx;
    }
  }

  // All busy — return oldest-hot (caller should fail fast, never sleep)
  let best = start;
  let bestUntil = Infinity;
  for (let i = 0; i < n; i++) {
    const until = state.hotUntil.get(i) || 0;
    if (until < bestUntil) {
      bestUntil = until;
      best = i;
    }
  }
  state.current = best;
  busy.add(best);
  return best;
}

/** Release in-flight reservation after a stream finishes (ok or fail). */
export function releaseGeminiKey(pool: GeminiKeyPool, keyIndex: number): void {
  inFlight(pool).delete(keyIndex);
}

/** Force-advance sticky pointer (e.g. non-429 retryable failure). */
export function rotateGeminiKey(pool: GeminiKeyPool): void {
  const keys = getGeminiKeys();
  const state = poolState(pool);
  state.current = (state.current + 1) % keys.length;
  savePersisted();
}

/** @deprecated Use markGeminiKeyHot */
export function markGeminiKeyCooldown(
  pool: GeminiKeyPool,
  keyIndex: number,
  _statusOrMessage?: number | string,
  _message?: string,
): void {
  markGeminiKeyHot(pool, keyIndex);
}

export function hasAvailableGeminiKey(pool: GeminiKeyPool): boolean {
  const keys = getGeminiKeys();
  return keys.some((_, i) => !isBusy(pool, i));
}

export function isKeyCooling(pool: GeminiKeyPool, keyIndex: number): boolean {
  return isHot(pool, keyIndex);
}

/** @deprecated Prefer pickGeminiKeyIndex('chat'). */
export function nextGeminiKeyIndex(keysLen: number): number {
  return pickGeminiKeyIndex("chat") % Math.max(1, keysLen);
}

/** @deprecated Prefer rotateGeminiKey. */
export function markGeminiKeyFailed(_failedIndex: number, _keysLen: number) {
  rotateGeminiKey("chat");
}

export function isRetryableGeminiError(status: number, body: string): boolean {
  if (RETRYABLE_STATUS.has(status)) return true;
  const lower = body.toLowerCase();
  return (
    lower.includes("resource_exhausted") ||
    lower.includes("quota") ||
    lower.includes("billing") ||
    lower.includes("rate limit") ||
    lower.includes("unavailable") ||
    lower.includes("overloaded")
  );
}

export function isRetryableGeminiMessage(message: string): boolean {
  return (
    /\b(403|429|500|502|503|504)\b/.test(message) ||
    /resource_exhausted|quota|billing|rate limit|unavailable|overloaded|bad gateway/i.test(
      message,
    ) ||
    message.includes("fetch failed") ||
    message.includes("ECONNRESET") ||
    message.includes("socket")
  );
}

export function parseGeminiStatus(message: string): number {
  const m = message.match(/\b(403|429|500|502|503|504)\b/);
  return m ? Number(m[1]) : 0;
}

export function isRateLimitMessage(message: string): boolean {
  return (
    /\b429\b/.test(message) ||
    /resource_exhausted|quota|rate limit/i.test(message)
  );
}

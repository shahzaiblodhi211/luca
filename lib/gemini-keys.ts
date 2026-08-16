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

/** Soft skip after 503 / high-demand — stay off this key for the rest of the turn. */
const HOT_MS_SOFT = 20_000;

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

/** Day-specific quota signals (not Google's generic "billing details" 429 copy). */
function hasDayQuotaSignal(message: string, lower: string): boolean {
  return (
    lower.includes("per day") ||
    lower.includes("perday") ||
    lower.includes("requests per day") ||
    lower.includes("rpd") ||
    /generaterequestsperday/i.test(message) ||
    /quota[_-]?metric[^"]*day/i.test(message) ||
    /quotaid[^"]*perday/i.test(message) ||
    /quotaid[^"]*day/i.test(message)
  );
}

/**
 * True when the error is daily/RPD quota (park until UTC midnight).
 * Google's free-tier RPM 429 often says "exceeded your current quota… plan and
 * billing details" with NO day hint — that must stay RPM (~55s), not RPD.
 */
export function isDailyQuotaMessage(message: string): boolean {
  const lower = message.toLowerCase();
  if (
    lower.includes("rate-limiting the available") ||
    lower.includes("rate-limited or out of") ||
    lower.includes("wait ~1 minute")
  ) {
    return false;
  }
  // Generic billing/quota blurb alone = RPM unless day signal present
  if (
    lower.includes("exceeded your current quota") ||
    lower.includes("quota exceeded") ||
    lower.includes("plan and billing") ||
    lower.includes("billing details")
  ) {
    return hasDayQuotaSignal(message, lower);
  }
  return (
    hasDayQuotaSignal(message, lower) ||
    (lower.includes("daily") && lower.includes("quota"))
  );
}

/** Plain-language error for the chat UI (never dump raw provider JSON). */
export function formatGeminiUserError(message: string): string {
  const lower = message.toLowerCase();
  if (
    /cooling|out of daily|all gemini keys|no cool keys|capacity/i.test(lower)
  ) {
    return "Luca is at capacity right now. Wait about a minute, or try again after midnight UTC.";
  }
  if (isPolicyRestrictedMessage(message)) {
    return "Luca couldn't finish that request. Try again in a moment.";
  }
  if (/shared.?project|same google cloud|rpm\/rpd pool/i.test(message)) {
    return "Luca is at capacity right now. Wait about a minute and try again.";
  }
  if (
    /\b429\b/.test(message) ||
    /resource_exhausted|resource has been exhausted|too many requests|quota/i.test(
      message,
    )
  ) {
    if (isDailyQuotaMessage(message)) {
      return "Luca's daily capacity is full. Try again after midnight UTC.";
    }
    return "Luca is busy right now. Wait about a minute and try again.";
  }
  if (/\b503\b/.test(message) || /high demand|overloaded/i.test(message)) {
    return "Luca is under heavy load. Try again in a moment.";
  }
  const brief = message.replace(/\s+/g, " ").trim();
  if (/gemini|api keys?|rotation|quota.*keys/i.test(brief)) {
    return "Luca couldn't finish that request. Try again in a moment.";
  }
  if (brief.length > 220) return `${brief.slice(0, 200)}…`;
  return brief;
}

/** Bare RESOURCE_EXHAUSTED with no per-day hint — often shared project / free-tier pool. */
export function isSharedPoolExhaustedMessage(message: string): boolean {
  const lower = message.toLowerCase();
  if (isDailyQuotaMessage(message)) return false;
  return (
    lower.includes("resource has been exhausted") ||
    lower.includes("resource_exhausted")
  );
}

/**
 * Process-wide RPM gate. Free-tier Flash-Lite is often ~15 RPM **per project**,
 * shared across every API key in that project. Rapid key rotation was burning
 * that single bucket and causing fake “all keys dead” cascades.
 */
const RPM_WINDOW_MS = 60_000;
const DEFAULT_POOL_RPM = 12;

declare global {
  // eslint-disable-next-line no-var
  var _geminiRpmTimestamps: number[] | undefined;
}

export async function awaitGeminiPoolRpmSlot(): Promise<void> {
  const maxRpm = Math.max(
    1,
    Number(process.env.GEMINI_POOL_RPM?.trim()) || DEFAULT_POOL_RPM,
  );
  if (!global._geminiRpmTimestamps) global._geminiRpmTimestamps = [];
  const stamps = global._geminiRpmTimestamps;

  for (;;) {
    const now = Date.now();
    while (stamps.length && now - stamps[0]! >= RPM_WINDOW_MS) {
      stamps.shift();
    }
    if (stamps.length < maxRpm) {
      stamps.push(now);
      return;
    }
    const waitMs = Math.max(250, RPM_WINDOW_MS - (now - stamps[0]!) + 100);
    console.info(
      `[gemini-keys] shared pool RPM cap ${maxRpm}/min — waiting ${Math.ceil(waitMs / 1000)}s`,
    );
    await new Promise((r) => setTimeout(r, waitMs));
  }
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

/** Park a Trust & Safety / ToS-restricted key for a week. */
const HOT_MS_POLICY = 7 * 24 * 60 * 60_000;

/** Trust & Safety / ToS — park this key and try the next one. */
export function isPolicyRestrictedMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("denied access") ||
    lower.includes("terms of service") ||
    lower.includes("acceptable use") ||
    lower.includes("policy violation") ||
    lower.includes("has been restricted") ||
    lower.includes("has been denied") ||
    (lower.includes("permission_denied") &&
      (lower.includes("project") || lower.includes("restricted")))
  );
}

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
  // eslint-disable-next-line no-var
  var _geminiKeySuccessStamps: Map<string, number[]> | undefined;
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

function parseGeminiKeysFile(raw: string): string[] {
  const byIndex = new Map<number, string>();
  const loose: string[] = [];
  for (const original of raw.split(/\r?\n/)) {
    const line = original.trim();
    if (!line || line.startsWith("#")) continue;
    const numbered = line.match(
      /^(?:export\s+)?GEMINI_API_KEY_(\d+)\s*=\s*(.+)$/i,
    );
    if (numbered) {
      const n = Number(numbered[1]);
      const value = numbered[2].trim().replace(/^["']|["']$/g, "");
      if (value && n >= 1 && n <= MAX_GEMINI_KEYS) byIndex.set(n, value);
      continue;
    }
    loose.push(line.replace(/^["']|["']$/g, ""));
  }
  const ordered: string[] = [];
  const maxN = Math.max(0, ...byIndex.keys());
  for (let i = 1; i <= maxN; i++) {
    const value = byIndex.get(i);
    if (value) ordered.push(value);
  }
  return [...ordered, ...loose];
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
      fromFile = parseGeminiKeysFile(raw);
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
  }

  if (keys.length === 0) {
    throw new Error(
      "No Gemini API keys configured (GEMINI_API_KEY_1…N, GEMINI_API_KEYS, and/or GEMINI_API_KEYS_FILE)",
    );
  }

  return { keys, fileAbs: meta.abs, fileMtime: meta.mtime };
}

/**
 * Load configured keys (up to {@link MAX_GEMINI_KEYS}):
 * - GEMINI_API_KEY_1…N
 * - and/or GEMINI_API_KEYS=keyA,keyB,… (comma / semicolon / whitespace)
 * - and/or GEMINI_API_KEYS_FILE=path/to/keys.txt
 *   (`GEMINI_API_KEY_1=…` lines, and/or one raw key per line)
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

  const prevLen = cached?.length || 0;
  const oldFps = global._geminiKeyFps;
  const { keys, fileAbs, fileMtime } = loadKeysFromConfig();

  if (cached?.length && !fileChanged && cached.length === keys.length) {
    return cached;
  }

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
  } else if (keys.length && !prevLen) {
    console.info(
      `[gemini-keys] loaded ${keys.length} key(s) — rotate on fail`,
    );
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

/** List cool (not hot, not in-flight) key indices. */
export function listCoolGeminiKeyIndices(pool: GeminiKeyPool): number[] {
  const keys = getGeminiKeys();
  const cool: number[] = [];
  for (let i = 0; i < keys.length; i++) {
    if (!isBusy(pool, i)) cool.push(i);
  }
  return cool;
}

/** Point cursor at the next cool key after `fromIndex` (wraps). */
export function jumpToNextCoolGeminiKey(
  pool: GeminiKeyPool,
  fromIndex: number,
): number | null {
  const keys = getGeminiKeys();
  const state = poolState(pool);
  const n = keys.length;
  if (!n) return null;
  const cool = listCoolGeminiKeyIndices(pool).filter((i) => i !== fromIndex);
  if (!cool.length) return null;
  const pick =
    n === 1 ? cool[0]! : (cool.find((i) => i > fromIndex) ?? cool[0]!);
  state.current = pick;
  savePersisted();
  return pick;
}

/** @deprecated Prefer {@link jumpToNextCoolGeminiKey}. */
export function jumpToRandomCoolGeminiKey(
  pool: GeminiKeyPool,
  excludeIndex?: number,
): number | null {
  return jumpToNextCoolGeminiKey(pool, excludeIndex ?? poolState(pool).current);
}

/** Park this key, then point the cursor at the next cool key. */
export function markGeminiKeyHot(
  pool: GeminiKeyPool,
  keyIndex: number,
  opts?: { daily?: boolean; message?: string; ms?: number },
): void {
  const keys = getGeminiKeys();
  const state = poolState(pool);
  const msg = opts?.message || "";
  const policy = isPolicyRestrictedMessage(msg);
  const daily =
    opts?.daily === true ||
    (msg ? isDailyQuotaMessage(msg) : false);
  const soft =
    !daily &&
    !policy &&
    (typeof opts?.ms === "number"
      ? false
      : msg
        ? isCapacityMessage(msg)
        : false);
  const hotMs =
    typeof opts?.ms === "number"
      ? opts.ms
      : policy
        ? HOT_MS_POLICY
        : daily
          ? msUntilNextUtcMidnight()
          : soft
            ? HOT_MS_SOFT
            : HOT_MS_RPM;
  const reason = policy
    ? "policy/restricted"
    : daily
      ? "daily/RPD"
      : soft
        ? "capacity"
        : "rpm";
  state.hotUntil.set(keyIndex, Date.now() + hotMs);
  inFlight(pool).delete(keyIndex);
  const next = jumpToNextCoolGeminiKey(pool, keyIndex);
  console.info(
    `[gemini-keys] key#${keyIndex + 1}/${keys.length} hot (~${Math.round(hotMs / 1000)}s, ${reason}) — next key#${(next ?? keyIndex) + 1}`,
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
 * Pick a cool key only. Never returns a hot key or an index in `exclude`.
 */
export function pickGeminiKeyIndex(
  pool: GeminiKeyPool,
  exclude?: Set<number>,
): number | null {
  const keys = getGeminiKeys();
  const state = poolState(pool);
  const n = keys.length;
  if (!n) return null;
  const busy = inFlight(pool);
  const cool = listCoolGeminiKeyIndices(pool).filter(
    (i) => !exclude?.has(i),
  );
  if (!cool.length) return null;

  const cur = ((state.current % n) + n) % n;
  const pick = cool.includes(cur)
    ? cur
    : cool.find((i) => i > cur) ?? cool[0]!;
  state.current = pick;
  busy.add(pick);
  return pick;
}

/** Release in-flight reservation after a stream finishes (ok or fail). */
export function releaseGeminiKey(pool: GeminiKeyPool, keyIndex: number): void {
  inFlight(pool).delete(keyIndex);
}

const SOFT_ROTATE_CALLS_PER_MIN = 12;

/**
 * After a successful stream: stay on this key until it is close to free-tier RPM,
 * then move to the next cool key.
 */
export function noteGeminiKeySuccess(
  pool: GeminiKeyPool,
  keyIndex: number,
): void {
  poolState(pool).current = keyIndex;
  if (!global._geminiKeySuccessStamps) global._geminiKeySuccessStamps = new Map();
  const stampKey = `${pool}:${keyIndex}`;
  const now = Date.now();
  const stamps = (global._geminiKeySuccessStamps.get(stampKey) || []).filter(
    (t) => now - t < RPM_WINDOW_MS,
  );
  stamps.push(now);
  global._geminiKeySuccessStamps.set(stampKey, stamps);
  if (stamps.length >= SOFT_ROTATE_CALLS_PER_MIN) {
    jumpToNextCoolGeminiKey(pool, keyIndex);
    global._geminiKeySuccessStamps.set(stampKey, []);
  }
  savePersisted();
}

/**
 * On error: park the failed key and point the cursor at the next cool key.
 * Prefer markGeminiKeyHot which already does this.
 */
export function rotateGeminiKey(pool: GeminiKeyPool, excludeIndex?: number): void {
  jumpToNextCoolGeminiKey(pool, excludeIndex ?? poolState(pool).current);
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
  return (pickGeminiKeyIndex("chat") ?? 0) % Math.max(1, keysLen);
}

/** @deprecated Prefer rotateGeminiKey. */
export function markGeminiKeyFailed(_failedIndex: number, _keysLen: number) {
  rotateGeminiKey("chat");
}

export function isRetryableGeminiError(status: number, body: string): boolean {
  if (RETRYABLE_STATUS.has(status)) return true;
  if (isPolicyRestrictedMessage(body) || isRateLimitMessage(body)) return true;
  const lower = body.toLowerCase();
  return (
    lower.includes("unavailable") ||
    lower.includes("overloaded") ||
    lower.includes("bad gateway")
  );
}

export function isRetryableGeminiMessage(message: string): boolean {
  if (isPolicyRestrictedMessage(message) || isRateLimitMessage(message)) {
    return true;
  }
  if (isCapacityMessage(message)) return true;
  return (
    /\b(403|429|500|502|503|504)\b/.test(message) ||
    /unavailable|overloaded|bad gateway|timeout|timed out|high demand/i.test(
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

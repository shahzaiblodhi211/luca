// Probe every key in gemini-keys.txt against the Gemini API and report
// which ones are dead (suspended / invalid / zero-quota blocked).
// Usage: node scripts/check-gemini-keys.mjs
import { readFileSync } from "fs";

const rawLines = readFileSync("gemini-keys.txt", "utf8").split(/\r?\n/);
const entries = rawLines
  .map((l, i) => ({ line: i + 1, key: l.replace(/#.*$/, "").trim() }))
  .filter((e) => e.key);

const mask = (k) => `${k.slice(0, 8)}…${k.slice(-4)}`;

async function probe(entry) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${entry.key}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (res.ok) return { ...entry, status: res.status, verdict: "OK" };
    let message = "";
    let details = "";
    try {
      const body = await res.json();
      message = body?.error?.message || "";
      details = JSON.stringify(body?.error?.details || []);
    } catch {}
    // Zero quota value = Google turned the tap off permanently for this project.
    const zeroQuota = /"quota_limit_value"\s*:\s*"0"/.test(details);
    const dead = res.status === 400 || res.status === 403 || zeroQuota;
    return {
      ...entry,
      status: res.status,
      verdict: dead ? "BLOCKED" : "RATE_LIMITED",
      message: message.slice(0, 100),
      zeroQuota,
    };
  } catch (err) {
    return { ...entry, status: 0, verdict: "NETWORK_ERROR", message: String(err).slice(0, 100) };
  }
}

const results = [];
for (const entry of entries) {
  results.push(await probe(entry));
  process.stdout.write(`checked ${results.length}/${entries.length}\r`);
  await new Promise((r) => setTimeout(r, 1500));
}

console.log("\n");
const by = (v) => results.filter((r) => r.verdict === v);
console.log(
  `OK: ${by("OK").length}  RATE_LIMITED: ${by("RATE_LIMITED").length}  BLOCKED: ${by("BLOCKED").length}  NETWORK_ERROR: ${by("NETWORK_ERROR").length}`,
);
for (const r of results.filter((r) => r.verdict !== "OK")) {
  console.log(
    `line ${r.line}  ${mask(r.key)}  HTTP ${r.status}  ${r.verdict}${r.zeroQuota ? " (quota=0)" : ""}  ${r.message || ""}`,
  );
}

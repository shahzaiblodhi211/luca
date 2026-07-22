import fs from "fs";
import os from "os";
import path from "path";

function dirHasChromium(dir: string): boolean {
  try {
    if (!fs.existsSync(dir)) return false;
    return fs
      .readdirSync(dir)
      .some(
        (n) =>
          n.startsWith("chromium") ||
          n.startsWith("chromium_headless_shell"),
      );
  } catch {
    return false;
  }
}

/** Walk a few levels for chrome-headless-shell.exe / chrome.exe */
function findChromeExecutable(root: string, depth = 0): string | null {
  if (depth > 5 || !fs.existsSync(root)) return null;
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(root, e.name);
      if (
        e.isFile() &&
        /^(chrome-headless-shell|chrome|chromium)(\.exe)?$/i.test(e.name)
      ) {
        return full;
      }
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const hit = findChromeExecutable(path.join(root, e.name), depth + 1);
      if (hit) return hit;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function collectCandidateRoots(): string[] {
  const home = os.homedir();
  const tmp = os.tmpdir();
  const candidates: string[] = [
    process.env.PLAYWRIGHT_BROWSERS_PATH || "",
    path.join(home, "AppData", "Local", "ms-playwright"),
    path.join(home, ".cache", "ms-playwright"),
    path.join(tmp, "playwright"),
    path.join(tmp, "cursor-sandbox-cache"),
    path.join(home, "AppData", "Local", "Temp", "cursor-sandbox-cache"),
  ].filter(Boolean);

  // Expand sandbox cache: …/cursor-sandbox-cache/<hash>/playwright
  for (const root of [...candidates]) {
    if (!/cursor-sandbox-cache/i.test(root)) continue;
    try {
      if (!fs.existsSync(root)) continue;
      for (const entry of fs.readdirSync(root)) {
        candidates.push(path.join(root, entry, "playwright"));
        candidates.push(path.join(root, entry));
      }
    } catch {
      /* ignore */
    }
  }

  return [...new Set(candidates)];
}

/**
 * Resolve Chromium for Playwright when browsers live in Cursor's sandbox
 * cache instead of the default %LOCALAPPDATA%/ms-playwright.
 */
export function resolvePlaywrightChromium(): {
  browsersPath?: string;
  executablePath?: string;
} {
  const roots = collectCandidateRoots();

  for (const dir of roots) {
    if (dirHasChromium(dir)) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = dir;
      const exe = findChromeExecutable(dir);
      console.info(
        "[playwright-env] browsersPath=",
        dir,
        "exe=",
        exe || "(default)",
      );
      return { browsersPath: dir, executablePath: exe || undefined };
    }
  }

  // Last resort: search Temp for chrome-headless-shell.exe
  const tempRoots = [
    path.join(os.homedir(), "AppData", "Local", "Temp"),
    os.tmpdir(),
  ];
  for (const temp of tempRoots) {
    try {
      if (!fs.existsSync(temp)) continue;
      for (const entry of fs.readdirSync(temp)) {
        if (!/cursor-sandbox|playwright/i.test(entry)) continue;
        const exe = findChromeExecutable(path.join(temp, entry));
        if (exe) {
          const browsersPath = path.dirname(
            path.dirname(path.dirname(exe)),
          );
          process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
          console.info(
            "[playwright-env] found exe via scan",
            exe,
            "browsersPath=",
            browsersPath,
          );
          return { browsersPath, executablePath: exe };
        }
      }
    } catch {
      /* ignore */
    }
  }

  console.warn(
    "[playwright-env] no Chromium found — run: npx playwright install chromium",
  );
  return {};
}

export function ensurePlaywrightBrowsersPath(): void {
  resolvePlaywrightChromium();
}

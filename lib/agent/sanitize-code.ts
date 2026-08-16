/**
 * Gemini sometimes appends leftover function-call JSON / arg fragments to
 * write_file.code or edit_file.new_string. Strip that junk before saving.
 */

/** True if the tail looks like leaked tool-call metadata (not valid source). */
export function hasToolCallLeak(code: string): boolean {
  const trimmed = code.replace(/\s+$/, "");
  if (!trimmed) return false;
  const tail = trimmed.slice(-240);
  if (/['"]\s*,\s*path\s*:/.test(tail)) return true;
  if (/\}\s*\{+\s*path\s*:/.test(tail)) return true;
  if (/,\s*path\s*:\s*['"]/.test(tail) && /replace_all\s*:/i.test(tail)) {
    return true;
  }
  if (/replace_all\s*:\s*(true|false)\s*\}?\s*$/i.test(trimmed)) return true;
  if (/\{\s*path\s*:\s*['"][^'"]+['"]\s*\}?\s*$/.test(trimmed)) return true;
  return false;
}

/**
 * Remove leaked tool-call tails. Returns cleaned code (may be unchanged).
 */
function hardenUnsafeJsonParse(code: string): string {
  return code.replace(
    /JSON\.parse\(\s*((?:window\.)?(?:local|session)Storage\.getItem\([^)]+\))(?:\s*\|\|\s*(?:""|''))?\s*\)/g,
    (_m, get: string) => `JSON.parse(${get} || "null")`,
  );
}

export function sanitizeGeneratedCode(code: string): string {
  if (!code) return code;
  let next = hardenUnsafeJsonParse(code);
  if (!hasToolCallLeak(next)) return next;

  // Prefer cutting at the earliest leak marker in the last ~400 chars
  const windowStart = Math.max(0, next.length - 400);
  const head = next.slice(0, windowStart);
  const tail = next.slice(windowStart);

  const markerRes = [
    /['"]\s*,\s*path\s*\s*:/,
    /['"]\s*,\s*replace_all\s*:/i,
    /\{\s*path\s*:/,
    /,\s*path\s*:\s*['"]/,
  ];

  let cutInTail = -1;
  for (const re of markerRes) {
    const m = re.exec(tail);
    if (m && m.index >= 0) {
      if (cutInTail < 0 || m.index < cutInTail) cutInTail = m.index;
    }
  }

  if (cutInTail >= 0) {
    const candidate = (head + tail.slice(0, cutInTail)).replace(/\s+$/, "");
    // Keep cut only if what remains looks like closed source (or empty)
    if (
      !candidate ||
      /[}\];"'`]\s*$/.test(candidate) ||
      /\*\//.test(candidate.slice(-4))
    ) {
      next = candidate;
    }
  }

  // Secondary: regex chops for leftovers still stuck on the end
  const chops = [
    /['"]\s*,\s*path\s*:\s*['"][^'"]+['"][\s\S]*$/i,
    /['"]\s*,\s*replace_all\s*:\s*(true|false)\s*\}?[\s\S]*$/i,
    /\{\s*path\s*:\s*['"][^'"]+['"]\s*\}?\s*$/i,
    /,\s*path\s*:\s*['"][^'"]+['"][\s\S]*$/i,
  ];

  for (let i = 0; i < 6; i++) {
    if (!hasToolCallLeak(next)) break;
    let changed = false;
    for (const re of chops) {
      const cleaned = next.replace(re, "").replace(/\s+$/, "");
      if (cleaned !== next) {
        next = cleaned;
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }

  // Stray leading quote left from `', path:...` if cut started after the quote
  if (/^[\s\S]*[}\];]\s*'\s*$/.test(next)) {
    next = next.replace(/'\s*$/, "").replace(/\s+$/, "");
  }

  return next;
}

/** True if the source already starts with a `"use client"` directive. */
export function hasUseClientDirective(code: string): boolean {
  const trimmed = code.replace(/^\uFEFF/, "").trimStart();
  // Allow leading comments before the directive
  const withoutComments = trimmed
    .replace(/^(\s*\/\/[^\n]*\n|\s*\/\*[\s\S]*?\*\/\s*)+/, "")
    .trimStart();
  return /^["']use client["']\s*;?/.test(withoutComments);
}

/**
 * Client-only APIs that break (or yield undefined components) in RSC
 * when `"use client"` is missing — e.g. framer-motion's `motion`.
 */
export function needsUseClientDirective(code: string): boolean {
  if (!code || hasUseClientDirective(code)) return false;
  if (
    /export\s+(const|async\s+function|function)\s+metadata\b/.test(code) ||
    /export\s+(async\s+)?function\s+generateMetadata\b/.test(code)
  ) {
    return false;
  }
  return (
    /from\s+["']framer-motion["']/.test(code) ||
    /from\s+["']motion\/react["']/.test(code) ||
    /from\s+["']motion["']/.test(code) ||
    /\bAnimatePresence\b/.test(code) ||
    /\bReact\.use\b/.test(code) ||
    /\b(useState|useEffect|useRef|useContext|useReducer|useLayoutEffect|useSyncExternalStore|useTransition|useOptimistic|useMemo|useCallback|use)\s*\(/.test(
      code,
    ) ||
    /\bon[A-Z][a-zA-Z]*\s*=\s*\{/.test(code)
  );
}

/** Prepend `"use client"` when the file clearly needs a Client Component. */
export function ensureUseClientDirective(code: string): string {
  if (!needsUseClientDirective(code)) return code;
  const body = code.replace(/^\uFEFF/, "");
  return `"use client";\n\n${body}`;
}

/** Fix `React.use` / `React.useState` without `import React`. */
export function ensureReactImport(code: string): string {
  if (!code || !/\bReact\./.test(code)) return code;
  if (
    /import\s+React\s*[,\s]/.test(code) ||
    /import\s+React\s+from\s+["']react["']/.test(code) ||
    /import\s+\*\s+as\s+React\s+from\s+["']react["']/.test(code)
  ) {
    return code;
  }
  const body = code.replace(/^\uFEFF/, "");
  const useClient = /^["']use client["'];?\s*/.exec(body);
  if (useClient) {
    const rest = body.slice(useClient[0].length);
    return `${useClient[0]}\nimport React from "react";\n${rest}`;
  }
  return `import React from "react";\n${body}`;
}

import type { AgentFile } from "./tools";

const STORE_INTENT_RE =
  /\b(e-?commerce|ecommerce|online store|webstore|shop|storefront|boutique|merch|catalog|fashion store|women'?s?\s*cloths?|men'?s?\s*cloths?|kids?\s*cloths?|bedsheets?|bedding)\b/i;

export function wantsFullStore(userText: string): boolean {
  const t = userText.trim();
  if (!t) return false;
  if (/\b(minimal store|skeleton shop|just (a )?homepage)\b/i.test(t)) {
    return false;
  }
  return STORE_INTENT_RE.test(t);
}

export type StoreMissing = {
  ok: boolean;
  /** Missing route/file paths only — never fuzzy “PDP thumbnail” strings. */
  writeNext: string[];
  nextLabel: string;
};

function hasPath(paths: string, re: RegExp): boolean {
  return re.test(paths);
}

/**
 * Gate on real files/routes only.
 * Dense PDP craft stays in Prompt.md — regex section checks caused infinite
 * finish↔edit_file loops that burned API quota.
 */
export function storeSuiteStatus(
  files: Map<string, AgentFile>,
): StoreMissing {
  const paths = [...files.keys()].join("\n").toLowerCase();
  const code = [...files.values()]
    .filter((f) => !f.isImage)
    .map((f) => f.code || "")
    .join("\n");

  const checks: Array<{ label: string; pathHint: string; ok: boolean }> = [
    {
      label: "Writing homepage",
      pathHint: "app/page.tsx",
      ok: hasPath(paths, /app\/page\.(tsx|jsx)/),
    },
    {
      label: "Writing shop",
      pathHint: "app/shop/page.tsx",
      ok: hasPath(paths, /app\/shop\/.*page\.(tsx|jsx)/),
    },
    {
      label: "Writing product page",
      pathHint: "app/product/[id]/page.tsx (or [slug])",
      ok: hasPath(paths, /app\/product(s)?\/\[.+\]\/page\.(tsx|jsx)/),
    },
    {
      label: "Writing cart",
      pathHint: "components/cart-drawer.tsx (or app/cart + cart store)",
      ok:
        /cart-drawer|cart-context|use-cart|app\/cart\//.test(paths) ||
        /\bCartDrawer\b|\buseCart\b|\buseCartStore\b/.test(code),
    },
    {
      label: "Writing checkout",
      pathHint: "app/checkout/page.tsx",
      ok: hasPath(paths, /app\/checkout\/.*page\.(tsx|jsx)/),
    },
    {
      label: "Writing search",
      pathHint: "app/search/page.tsx",
      ok: hasPath(paths, /app\/search\/.*page\.(tsx|jsx)/),
    },
    {
      label: "Writing profile",
      pathHint: "app/profile/page.tsx",
      ok: hasPath(paths, /app\/profile\/.*page\.(tsx|jsx)/),
    },
    {
      label: "Writing admin",
      pathHint: "app/admin/page.tsx",
      ok: hasPath(paths, /app\/admin\/.*page\.(tsx|jsx)/),
    },
    {
      label: "Writing product catalog",
      pathHint: "lib/products.ts",
      ok: hasPath(paths, /lib\/products\.(ts|tsx|js)/),
    },
    {
      label: "Writing site header",
      pathHint: "components/site-header.tsx",
      ok: /site-header|components\/header/.test(paths),
    },
    {
      label: "Writing site footer",
      pathHint: "components/site-footer.tsx",
      ok: /site-footer|components\/footer/.test(paths),
    },
  ];

  const writeNext = checks.filter((c) => !c.ok).map((c) => c.pathHint);
  const first = checks.find((c) => !c.ok);

  return {
    ok: writeNext.length === 0,
    writeNext,
    nextLabel: first?.label || "Writing store pages",
  };
}

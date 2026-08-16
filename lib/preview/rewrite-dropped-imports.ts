const STUB_SPEC = "@/lib/luca-pkg-stub";

export const LUCA_PKG_STUB = `"use client";

import type { ReactNode } from "react";

function Stub({ children }: { children?: ReactNode }) {
  return <>{children ?? null}</>;
}

export default Stub;
`;

function isDroppedSpecifier(spec: string, dropped: Set<string>): boolean {
  for (const name of dropped) {
    if (spec === name || spec.startsWith(`${name}/`)) return true;
  }
  return false;
}

/** Point fake / unpublished npm imports at a local stub so Next can build. */
export function rewriteDroppedPackageImports(
  code: string,
  dropped: Set<string>,
): string {
  if (!dropped.size) return code;
  return code.replace(
    /\b(?:from|import|require)\s*\(?\s*(["'])([^"']+)\1/g,
    (full, quote: string, spec: string) => {
      if (!isDroppedSpecifier(spec, dropped)) return full;
      return full.replace(`${quote}${spec}${quote}`, `${quote}${STUB_SPEC}${quote}`);
    },
  );
}

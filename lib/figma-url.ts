const FIGMA_HOST = /(^|\.)figma\.com$/i;

export type FigmaRef = {
  url: string;
  fileKey: string;
  nodeId?: string;
  fileName: string;
};

export function isFigmaUrl(raw: string): boolean {
  try {
    return FIGMA_HOST.test(new URL(raw).hostname);
  } catch {
    return false;
  }
}

export function extractFigmaUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"'`)\]]+/gi) || [];
  return [
    ...new Set(
      matches
        .map((u) => u.replace(/[.,;!?]+$/, ""))
        .filter(isFigmaUrl),
    ),
  ];
}

export function parseFigmaUrl(raw: string): FigmaRef | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (!FIGMA_HOST.test(u.hostname)) return null;

  const parts = u.pathname.split("/").filter(Boolean);
  const kindIdx = parts.findIndex((p) =>
    /^(design|file|proto|board|slides|make)$/i.test(p),
  );
  if (kindIdx < 0 || !parts[kindIdx + 1]) return null;

  let fileKey = parts[kindIdx + 1];
  const branchIdx = parts.indexOf("branch");
  if (branchIdx >= 0 && parts[branchIdx + 1]) {
    fileKey = parts[branchIdx + 1];
  }

  const nodeRaw =
    u.searchParams.get("node-id") || u.searchParams.get("node_id") || "";
  const nodeId = nodeRaw ? nodeRaw.replace(/-/g, ":") : undefined;
  const fileName = decodeURIComponent(parts[parts.length - 1] || fileKey);

  return { url: raw, fileKey, nodeId, fileName };
}

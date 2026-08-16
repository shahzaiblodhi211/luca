import type { ProjectFile } from "./types";

export function isFigmaCanvasCode(code: string): boolean {
  return /useSiteLife|containerType:\s*"inline-size"|className="luca-(nav|cta|field|link)"/.test(
    code,
  );
}

export function filesHaveFigmaCanvas(
  files?: Array<Pick<ProjectFile, "path" | "code">> | null,
): boolean {
  const page = files?.find(
    (file) => file.path.replace(/^\/+/, "") === "app/page.tsx",
  );
  return Boolean(page?.code && isFigmaCanvasCode(page.code));
}

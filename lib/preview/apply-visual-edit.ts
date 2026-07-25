import type { ProjectFile } from "@/lib/types";

export type VisualEditSelection = {
  tagName: string;
  text: string;
  selector: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  fontStyle: string;
  color: string;
};

export function routeToPageCandidates(routePath: string): string[] {
  if (routePath === "/" || !routePath) {
    return ["app/page.tsx", "app/page.jsx"];
  }
  const seg = routePath.replace(/^\/+|\/+$/g, "");
  return [
    `app/${seg}/page.tsx`,
    `app/${seg}/page.jsx`,
    `app/page.tsx`,
  ];
}

export function applyTextToProjectFiles(
  files: ProjectFile[],
  routePath: string,
  oldText: string,
  newText: string,
): ProjectFile[] | null {
  const trimmedOld = oldText.trim();
  const trimmedNew = newText.trim();
  if (!trimmedOld || trimmedOld === trimmedNew) return null;

  const order = routeToPageCandidates(routePath);
  const paths = new Set([
    ...order,
    ...files.filter((f) => /\.(tsx|jsx)$/i.test(f.path)).map((f) => f.path),
  ]);

  for (const path of paths) {
    const file = files.find((f) => f.path.replace(/^\/+/, "") === path.replace(/^\/+/, ""));
    if (!file?.code.includes(trimmedOld)) continue;
    const code = file.code.split(trimmedOld).join(trimmedNew);
    if (code === file.code) continue;
    return files.map((f) =>
      f.path === file.path ? { ...f, code } : f,
    );
  }
  return null;
}

export function parseFontSizePx(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (/^\d+$/.test(v)) return `${v}px`;
  return v;
}

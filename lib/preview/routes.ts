import type { ProjectFile } from "@/lib/types";

export type PreviewRoute = {
  path: string;
  label: string;
  kind: "page" | "api";
};

function segmentToLabel(segment: string): string {
  if (segment.startsWith("[") && segment.endsWith("]")) {
    return segment.slice(1, -1);
  }
  return segment
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function routeLabel(routePath: string): string {
  if (routePath === "/") return "Homepage";
  const parts = routePath.split("/").filter(Boolean);
  return parts.map(segmentToLabel).join(" / ");
}

const AUTH_DEFAULT_CANDIDATES = [
  "/login",
  "/auth/login",
  "/signin",
  "/auth/signin",
  "/sign-in",
];

function hasAppPage(files: ProjectFile[]): boolean {
  return files.some((f) => {
    const p = f.path.replace(/^\/+/, "");
    return /^app\/page\.(tsx|jsx|ts|js)$/.test(p);
  });
}

/** True when homepage is missing or only redirects into auth. */
function homepageIsAuthRedirect(files: ProjectFile[]): boolean {
  const page = files.find((f) =>
    /^\/?app\/page\.(tsx|jsx|ts|js)$/.test(f.path.replace(/^\/+/, "")),
  );
  if (!page) return true;
  const code = page.code;
  // redirect('/login') | redirect("/auth/login") | href="/login" only stubs
  if (/redirect\s*\(\s*['"`]\/(auth\/)?(login|signin|sign-in)/i.test(code)) {
    return true;
  }
  if (
    code.length < 400 &&
    /\/(auth\/)?(login|signin|sign-in)/i.test(code) &&
    !/<h1|<Hero|landing/i.test(code)
  ) {
    return true;
  }
  return false;
}

function hasAuthPages(paths: string[]): boolean {
  return paths.some(
    (p) =>
      /(^|\/)(login|signin|sign-in|signup|sign-up|forgot-password)(\/|$)/i.test(
        p,
      ) || p.startsWith("/auth/"),
  );
}

/** App Router page + API routes from project file paths. */
export function listPreviewRoutes(files: ProjectFile[]): PreviewRoute[] {
  const pages = new Map<string, PreviewRoute>();
  const apis = new Map<string, PreviewRoute>();

  for (const file of files) {
    const rel = file.path.replace(/^\/+/, "");

    const pageMatch = rel.match(/^app\/(.*)page\.(tsx|jsx|ts|js)$/);
    if (pageMatch) {
      const dir = pageMatch[1];
      const segments = dir
        .split("/")
        .filter(Boolean)
        .filter((s) => !s.startsWith("(") && !s.startsWith("@"));
      const routePath =
        segments.length === 0 ? "/" : `/${segments.join("/")}`;
      pages.set(routePath, {
        path: routePath,
        label: routeLabel(routePath),
        kind: "page",
      });
      continue;
    }

    const apiMatch = rel.match(/^app\/(.*)route\.(ts|js)$/);
    if (apiMatch) {
      const dir = apiMatch[1];
      const segments = dir
        .split("/")
        .filter(Boolean)
        .filter((s) => !s.startsWith("(") && !s.startsWith("@"));
      const routePath = `/${segments.join("/")}`;
      apis.set(routePath, {
        path: routePath,
        label: `API ${routePath}`,
        kind: "api",
      });
    }
  }

  // Only list Homepage when app/page.tsx actually exists
  if (!hasAppPage(files)) {
    pages.delete("/");
  }

  return [
    ...[...pages.values()].sort((a, b) => a.path.localeCompare(b.path)),
    ...[...apis.values()].sort((a, b) => a.path.localeCompare(b.path)),
  ];
}

/**
 * Prefer login when the project is auth-focused and homepage is absent/redirect-only.
 * Otherwise prefer `/`, then first page route.
 */
export function pickDefaultPreviewRoute(
  files: ProjectFile[],
  routes?: PreviewRoute[],
): string {
  const pageRoutes = (routes ?? listPreviewRoutes(files)).filter(
    (r) => r.kind === "page",
  );
  const paths = pageRoutes.map((r) => r.path);

  if (hasAuthPages(paths) && homepageIsAuthRedirect(files)) {
    for (const candidate of AUTH_DEFAULT_CANDIDATES) {
      if (paths.includes(candidate)) return candidate;
    }
    const anyLogin = paths.find((p) => /login|signin|sign-in/i.test(p));
    if (anyLogin) return anyLogin;
  }

  if (paths.includes("/")) return "/";
  return paths[0] || "/";
}

const cache = new Map<string, boolean>();

export async function npmPackageExists(name: string): Promise<boolean> {
  const key = name.trim();
  if (!key) return false;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  try {
    const res = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(key)}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (res.status === 404) {
      cache.set(key, false);
      return false;
    }
    if (res.ok) {
      cache.set(key, true);
      return true;
    }
    return true;
  } catch {
    return true;
  }
}

export async function filterExistingNpmPackages(
  deps: Record<string, string>,
): Promise<{ kept: Record<string, string>; dropped: string[] }> {
  const names = Object.keys(deps);
  const flags = await Promise.all(names.map((name) => npmPackageExists(name)));
  const kept: Record<string, string> = {};
  const dropped: string[] = [];
  names.forEach((name, i) => {
    if (flags[i]) kept[name] = deps[name];
    else dropped.push(name);
  });
  return { kept, dropped };
}

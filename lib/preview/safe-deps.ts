import { isKnownPackage, isPreinstalledPackage } from "@/lib/sandpack-deps";
import { PREVIEW_CORE_DEPS } from "./deps";
import { filterExistingNpmPackages } from "./npm-registry";

export async function keepInstallableDeps(
  deps: Record<string, string>,
): Promise<{ deps: Record<string, string>; dropped: string[] }> {
  const extras: Record<string, string> = {};
  const kept: Record<string, string> = { ...PREVIEW_CORE_DEPS };

  for (const [name, ver] of Object.entries(deps)) {
    if (name in PREVIEW_CORE_DEPS) continue;
    if (isKnownPackage(name) || isPreinstalledPackage(name)) {
      kept[name] = ver;
      continue;
    }
    extras[name] = ver;
  }

  const { kept: extraKept, dropped } = await filterExistingNpmPackages(extras);
  return { deps: { ...kept, ...extraKept }, dropped };
}

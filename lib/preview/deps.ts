import {
  PREINSTALLED_PACKAGES,
  resolveSandpackDependencies,
} from "@/lib/sandpack-deps";
import type { ProjectFile } from "@/lib/types";

/** Host/runtime packages pinned for every preview workspace. */
const PREVIEW_HOST_DEPS: Record<string, string> = {
  next: "16.2.10",
  react: "19.2.4",
  "react-dom": "19.2.4",
  tailwindcss: "4.1.11",
  "@tailwindcss/postcss": "4.1.11",
  typescript: "5.8.3",
  "@types/node": "20.17.30",
  "@types/react": "19.1.2",
  "@types/react-dom": "19.1.2",
};

/** Core packages every preview workspace needs (includes preinstalled UI libs). */
export const PREVIEW_CORE_DEPS: Record<string, string> = {
  ...PREVIEW_HOST_DEPS,
  ...PREINSTALLED_PACKAGES,
};

export { PREINSTALLED_PACKAGES };

export function resolvePreviewDependencies(
  files: ProjectFile[],
  explicitPackages: Record<string, string> = {},
): Record<string, string> {
  const inferred = resolveSandpackDependencies(files);
  return {
    ...PREVIEW_CORE_DEPS,
    ...inferred,
    ...explicitPackages,
    // Keep Next/React pinned to host-compatible versions
    next: PREVIEW_HOST_DEPS.next,
    react: PREVIEW_HOST_DEPS.react,
    "react-dom": PREVIEW_HOST_DEPS["react-dom"],
  };
}

import { resolveSandpackDependencies } from "@/lib/sandpack-deps";
import type { ProjectFile } from "@/lib/types";

/** Core packages every preview workspace needs. */
export const PREVIEW_CORE_DEPS: Record<string, string> = {
  next: "16.2.10",
  react: "19.2.4",
  "react-dom": "19.2.4",
  "lucide-react": "0.469.0",
  clsx: "2.1.1",
  "tailwind-merge": "2.6.0",
  "class-variance-authority": "0.7.1",
  "@radix-ui/react-slot": "1.1.1",
  "framer-motion": "11.15.0",
  tailwindcss: "4.1.11",
  "@tailwindcss/postcss": "4.1.11",
  typescript: "5.8.3",
  "@types/node": "20.17.30",
  "@types/react": "19.1.2",
  "@types/react-dom": "19.1.2",
};

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
    next: PREVIEW_CORE_DEPS.next,
    react: PREVIEW_CORE_DEPS.react,
    "react-dom": PREVIEW_CORE_DEPS["react-dom"],
  };
}

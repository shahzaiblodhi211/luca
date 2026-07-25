import JSZip from "jszip";
import type { ProjectFile } from "@/lib/types";

function normalizePath(path: string): string {
  return path.replace(/^\/+/, "").replace(/\\/g, "/");
}

/** Build a ZIP of project files exactly as stored (no transforms). */
export async function buildProjectZipBlob(
  files: ProjectFile[],
  opts?: {
    packages?: Record<string, string>;
    projectName?: string;
  },
): Promise<Blob> {
  const zip = new JSZip();
  const root = (opts?.projectName || "luca-project")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "luca-project";
  const folder = zip.folder(root);
  if (!folder) throw new Error("Failed to create zip folder");

  const seen = new Set<string>();
  for (const file of files) {
    const path = normalizePath(file.path);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    folder.file(path, file.code ?? "");
  }

  // If agent tracked packages but never wrote package.json, include a minimal one
  // so the unzip is runnable — only when package.json is missing.
  if (!seen.has("package.json") && opts?.packages && Object.keys(opts.packages).length) {
    const pkg = {
      name: root,
      private: true,
      scripts: {
        dev: "next dev",
        build: "next build",
        start: "next start",
      },
      dependencies: {
        next: "15.1.0",
        react: "^19.0.0",
        "react-dom": "^19.0.0",
        ...opts.packages,
      },
      devDependencies: {
        typescript: "^5",
        "@types/node": "^20",
        "@types/react": "^19",
        "@types/react-dom": "^19",
        tailwindcss: "^4",
        "@tailwindcss/postcss": "^4",
      },
    };
    folder.file("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
  }

  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadProjectZip(
  files: ProjectFile[],
  opts?: {
    packages?: Record<string, string>;
    projectName?: string;
  },
) {
  const name = (opts?.projectName || "luca-project")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "luca-project";
  const blob = await buildProjectZipBlob(files, { ...opts, projectName: name });
  downloadBlob(blob, `${name}.zip`);
}

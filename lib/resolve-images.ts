import { fetchPexelsPhoto } from "./pexels-image";
import type { ChatImageRef, ProjectFile } from "./types";

export type ImageJob = {
  query: string;
  path: string;
  aspectHint?: string;
  /** Already-resolved live URL (skip fetch). */
  url?: string;
};

const CODE_META_RE =
  /```([\w.+-]*)\s*([^\n`]*)\n([\s\S]*?)```/g;

function parseAspect(query: string, meta: string): string | undefined {
  const fromMeta = meta.match(/aspect=["']([^"']+)["']/i)?.[1];
  if (fromMeta) return fromMeta;
  if (/portrait|vertical|mobile/i.test(query)) return "9:16";
  if (/square|icon|avatar|logo/i.test(query)) return "1:1";
  if (/banner|hero|wide|landscape/i.test(query)) return "16:9";
  return "16:9";
}

function slugPath(query: string, index: number): string {
  const slug = query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `public/images/${slug || `image-${index}`}.jpg`;
}

function publicPathFromJob(path: string): string {
  if (path.startsWith("public/")) return `/${path.slice("public/".length)}`;
  if (path.startsWith("/")) return path;
  return `/${path}`;
}

export function extractImageJobs(content: string): ImageJob[] {
  const jobs: ImageJob[] = [];
  const seen = new Set<string>();

  const re = new RegExp(CODE_META_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const meta = match[2] || "";
    const query = meta.match(/query=["']([^"']+)["']/i)?.[1]?.trim();
    if (!query) continue;
    const filePath =
      meta.match(/file=["']([^"']+)["']/i)?.[1]?.trim() ||
      slugPath(query, jobs.length + 1);
    const key = `${filePath}::${query.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    jobs.push({
      query,
      path: filePath.replace(/^\/+/, ""),
      aspectHint: parseAspect(query, meta),
    });
  }

  const placeholderRe =
    /\/placeholder\.svg\?[^"')\s]*query=([^&"' )\s]+)[^"' )\s]*/gi;
  while ((match = placeholderRe.exec(content)) !== null) {
    const query = decodeURIComponent(match[1]).trim();
    if (!query) continue;
    const path = slugPath(query, jobs.length + 1);
    const key = `${path}::${query.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    jobs.push({ query, path, aspectHint: parseAspect(query, "") });
  }

  return jobs;
}

/**
 * Resolve image jobs to **live HTTPS URLs** (Pexels).
 * Does NOT call Gemini image generation.
 */
export async function resolveImageJobs(jobs: ImageJob[]): Promise<{
  images: ChatImageRef[];
  /** Maps local path → live URL (same shape as old dataUrls for rewrites). */
  dataUrls: Record<string, string>;
}> {
  if (!jobs.length) {
    return { images: [], dataUrls: {} };
  }

  const images: ChatImageRef[] = [];
  const dataUrls: Record<string, string> = {};

  for (const job of jobs) {
    try {
      let url = job.url?.trim();
      if (!url) {
        const photo = await fetchPexelsPhoto(job.query, job.aspectHint);
        url = photo?.url;
      }
      if (!url) {
        console.warn("[images] no Pexels result for:", job.query);
        continue;
      }

      const publicPath = publicPathFromJob(job.path);
      const ref: ChatImageRef = {
        id: `pexels-${Buffer.from(job.query).toString("base64url").slice(0, 24)}`,
        path: publicPath,
        query: job.query,
        mimeType: "image/jpeg",
        url,
      };
      images.push(ref);
      dataUrls[publicPath] = url;
      dataUrls[job.path] = url;
      dataUrls[job.path.replace(/^public\//, "/")] = url;
    } catch (err) {
      console.error("[images] job failed:", job.query, err);
    }
  }

  return { images, dataUrls };
}

/** @deprecated Prefer resolveImageJobs with structured agent image events. */
export async function resolveImagesForContent(content: string): Promise<{
  content: string;
  images: ChatImageRef[];
  dataUrls: Record<string, string>;
}> {
  const { images, dataUrls } = await resolveImageJobs(extractImageJobs(content));
  return { content, images, dataUrls };
}

export function applyImageUrlsToFiles(
  files: ProjectFile[],
  dataUrls: Record<string, string>,
): ProjectFile[] {
  if (!Object.keys(dataUrls).length) return files;

  return files.map((file) => {
    let code = file.code;
    for (const [path, liveUrl] of Object.entries(dataUrls)) {
      if (!liveUrl.startsWith("http")) continue;
      const variants = [
        path,
        path.replace(/^\//, ""),
        path.startsWith("/") ? path : `/${path}`,
        path.replace(/^public\//, "/"),
        `/${path.replace(/^public\//, "")}`,
      ];
      for (const variant of [...new Set(variants)]) {
        code = code.split(`"${variant}"`).join(`"${liveUrl}"`);
        code = code.split(`'${variant}'`).join(`'${liveUrl}'`);
        code = code.split(`\`${variant}\``).join(`\`${liveUrl}\``);
      }
    }
    return { ...file, code };
  });
}

export function injectImageFiles(
  files: ProjectFile[],
  images: ChatImageRef[],
  _dataUrls: Record<string, string>,
): ProjectFile[] {
  const map = new Map(files.map((f) => [f.path, f]));
  for (const img of images) {
    const sandpackPath = img.path.replace(/^\//, "");
    if (!map.has(sandpackPath) && !map.has(img.path)) {
      map.set(sandpackPath, {
        path: sandpackPath,
        language: "txt",
        code: `Live image (Pexels): ${img.query}\nURL: ${img.url || img.path}\n`,
      });
    }
  }
  return Array.from(map.values());
}

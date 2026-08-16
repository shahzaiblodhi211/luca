import { generateImagenImage, type ImageKind } from "./gemini-image";
import { saveImage, toDataUrl } from "./image-store";
import type { ChatImageRef, ProjectFile } from "./types";

export type ImageJob = {
  query: string;
  path: string;
  aspectHint?: string;
  kind?: ImageKind;
  /** Already-resolved URL (/api/images/… or https). */
  url?: string;
  /** Optional precomputed data URL for preview injection. */
  dataUrl?: string;
  imageId?: string;
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

function parseKind(query: string, meta: string): ImageKind {
  const fromMeta = meta.match(/kind=["']([^"']+)["']/i)?.[1]?.toLowerCase();
  if (fromMeta === "logo" || fromMeta === "illustration" || fromMeta === "photo") {
    return fromMeta;
  }
  if (/logo|wordmark|monogram|brand mark/i.test(query) || /logo/i.test(meta)) {
    return "logo";
  }
  if (/illustration|flat design|vector art/i.test(query)) return "illustration";
  return "photo";
}

function slugPath(query: string, index: number, kind: ImageKind): string {
  const slug = query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  const ext = kind === "logo" ? "png" : "jpg";
  return `public/images/${slug || `image-${index}`}.${ext}`;
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
    const kind = parseKind(query, meta);
    const filePath =
      meta.match(/file=["']([^"']+)["']/i)?.[1]?.trim() ||
      slugPath(query, jobs.length + 1, kind);
    const key = `${filePath}::${query.toLowerCase()}::${kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    jobs.push({
      query,
      path: filePath.replace(/^\/+/, ""),
      aspectHint: parseAspect(query, meta),
      kind,
    });
  }

  const placeholderRe =
    /\/placeholder\.svg\?[^"')\s]*query=([^&"' )\s]+)[^"' )\s]*/gi;
  while ((match = placeholderRe.exec(content)) !== null) {
    const query = decodeURIComponent(match[1]).trim();
    if (!query) continue;
    const kind = parseKind(query, "");
    const path = slugPath(query, jobs.length + 1, kind);
    const key = `${path}::${query.toLowerCase()}::${kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    jobs.push({ query, path, aspectHint: parseAspect(query, ""), kind });
  }

  return jobs;
}

/**
 * Resolve image jobs via Imagen → Mongo → /api/images/{id}.
 * `dataUrls` are data: URLs for preview injection (not written into source).
 */
export async function resolveImageJobs(jobs: ImageJob[]): Promise<{
  images: ChatImageRef[];
  dataUrls: Record<string, string>;
}> {
  if (!jobs.length) {
    return { images: [], dataUrls: {} };
  }

  const images: ChatImageRef[] = [];
  const dataUrls: Record<string, string> = {};

  for (const job of jobs) {
    try {
      const publicPath = publicPathFromJob(job.path);
      const kind = job.kind || "photo";
      let id = job.imageId;
      let dataUrl = job.dataUrl;
      let apiUrl = job.url;

      if (apiUrl?.startsWith("http://") || apiUrl?.startsWith("https://")) {
        const ref: ChatImageRef = {
          id: id || job.path,
          path: publicPath,
          query: job.query,
          mimeType: "image/jpeg",
          url: apiUrl,
        };
        images.push(ref);
        dataUrls[publicPath] = apiUrl;
        dataUrls[job.path] = apiUrl;
        dataUrls[job.path.replace(/^public\//, "/")] = apiUrl;
        dataUrls[`public${publicPath}`] = apiUrl;
        continue;
      }

      if (apiUrl?.startsWith("/api/images/")) {
        id = apiUrl.slice("/api/images/".length);
      }

      if (!dataUrl || !id) {
        const { getImageById } = await import("./image-store");
        if (id) {
          const existing = await getImageById(id);
          if (existing) {
            dataUrl = toDataUrl(existing);
            apiUrl = `/api/images/${existing._id}`;
            id = existing._id;
          }
        }
      }

      if (!dataUrl || !id) {
        const bytes = await generateImagenImage(job.query, {
          aspectHint: job.aspectHint,
          kind,
        });
        const stored = await saveImage({
          query: job.query,
          mimeType: bytes.mimeType,
          base64: bytes.base64,
          path: job.path,
          salt: `${kind}:${job.aspectHint || ""}:`,
        });
        id = stored._id;
        dataUrl = toDataUrl(stored);
        apiUrl = `/api/images/${stored._id}`;
      }

      const ref: ChatImageRef = {
        id: id!,
        path: publicPath,
        query: job.query,
        mimeType: dataUrl.startsWith("data:image/png")
          ? "image/png"
          : "image/jpeg",
        url: apiUrl || `/api/images/${id}`,
      };
      images.push(ref);
      dataUrls[publicPath] = dataUrl!;
      dataUrls[job.path] = dataUrl!;
      dataUrls[job.path.replace(/^public\//, "/")] = dataUrl!;
      dataUrls[`public${publicPath}`] = dataUrl!;
    } catch (err) {
      console.error("[images] Imagen job failed:", job.query, err);
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
      // Only rewrite to http(s) or /api/images — never inline huge data: URLs into source
      if (
        !liveUrl.startsWith("http") &&
        !liveUrl.startsWith("/api/images/")
      ) {
        continue;
      }
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
        code: `Generated image (Imagen): ${img.query}\nURL: ${img.url || img.path}\n`,
      });
    }
  }
  return Array.from(map.values());
}

type ImageKind = "photo" | "logo" | "illustration";

type PexelsPhoto = {
  id: number;
  width: number;
  height: number;
  photographer: string;
  photographer_url: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    portrait: string;
    landscape: string;
  };
};

type PexelsSearchResponse = {
  photos?: PexelsPhoto[];
  error?: string;
};

export function hasPexelsKey(): boolean {
  return Boolean(process.env.PEXELS_API_KEY?.trim());
}

function pexelsOrientation(
  aspect: string,
): "landscape" | "portrait" | "square" | undefined {
  if (aspect === "9:16" || aspect === "3:4") return "portrait";
  if (aspect === "1:1") return "square";
  if (aspect === "16:9" || aspect === "4:3") return "landscape";
  return undefined;
}

function pickPexelsSrc(photo: PexelsPhoto, aspect: string): string {
  const src = photo.src;
  if (aspect === "9:16" || aspect === "3:4") {
    return src.portrait || src.large2x || src.large || src.original;
  }
  if (aspect === "1:1") {
    return src.large2x || src.large || src.original;
  }
  return src.landscape || src.large2x || src.large || src.original;
}

export type PexelsDirectPhoto = {
  photoId: number;
  directUrl: string;
  attribution: string;
  alt?: string;
};

/**
 * Stock photo as a direct hotlink URL (images.pexels.com CDN) — no download.
 * Skips photo ids in `excludeIds` so one build doesn't repeat the same shot.
 */
export async function searchPexelsPhoto(
  query: string,
  opts: { aspect: string; excludeIds?: Set<number> },
): Promise<PexelsDirectPhoto> {
  const apiKey = process.env.PEXELS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("PEXELS_API_KEY not configured");
  }

  const q = query.trim();
  const orientation = pexelsOrientation(opts.aspect);
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", q);
  url.searchParams.set("per_page", "10");
  if (orientation) url.searchParams.set("orientation", orientation);

  console.info(
    `[image] pexels direct search aspect=${opts.aspect} q=${q.slice(0, 80)}`,
  );

  const searchRes = await fetch(url.toString(), {
    headers: { Authorization: apiKey },
  });
  if (!searchRes.ok) {
    const body = await searchRes.text().catch(() => "");
    throw new Error(
      `Pexels search ${searchRes.status}: ${body.slice(0, 200) || searchRes.statusText}`,
    );
  }

  const data = (await searchRes.json()) as PexelsSearchResponse;
  const photos = data.photos ?? [];
  if (!photos.length) {
    throw new Error(`Pexels: no photos for "${q.slice(0, 80)}"`);
  }

  const exclude = opts.excludeIds;
  const photo = photos.find((p) => !exclude?.has(p.id)) ?? photos[0];

  return {
    photoId: photo.id,
    directUrl: pickPexelsSrc(photo, opts.aspect),
    attribution: `Photo by ${photo.photographer} on Pexels`,
  };
}

/** Stock photo from Pexels CDN — downloaded for /api/images storage. */
export async function requestPexelsImage(
  query: string,
  opts: { kind: ImageKind; aspect: string },
): Promise<{
  mimeType: string;
  base64: string;
  source: "pexels";
  model: string;
  directUrl: string;
  attribution: string;
}> {
  if (opts.kind !== "photo") {
    throw new Error("Pexels only supports photo assets");
  }

  const apiKey = process.env.PEXELS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("PEXELS_API_KEY not configured");
  }

  const q = query.trim();
  const orientation = pexelsOrientation(opts.aspect);
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", q);
  url.searchParams.set("per_page", "5");
  if (orientation) url.searchParams.set("orientation", orientation);

  console.info(
    `[image] pexels search kind=${opts.kind} aspect=${opts.aspect} q=${q.slice(0, 80)}`,
  );

  const searchRes = await fetch(url.toString(), {
    headers: { Authorization: apiKey },
  });

  if (!searchRes.ok) {
    const body = await searchRes.text().catch(() => "");
    throw new Error(
      `Pexels search ${searchRes.status}: ${body.slice(0, 200) || searchRes.statusText}`,
    );
  }

  const data = (await searchRes.json()) as PexelsSearchResponse;
  const photo = data.photos?.[0];
  if (!photo) {
    throw new Error(`Pexels: no photos for "${q.slice(0, 80)}"`);
  }

  const directUrl = pickPexelsSrc(photo, opts.aspect);
  const imageRes = await fetch(directUrl, { headers: { Accept: "image/*" } });
  if (!imageRes.ok) {
    throw new Error(`Pexels download ${imageRes.status}`);
  }

  const mimeType =
    imageRes.headers.get("content-type")?.split(";")[0].trim() || "image/jpeg";
  const buf = Buffer.from(await imageRes.arrayBuffer());
  if (buf.length < 500) {
    throw new Error("Pexels returned an empty image");
  }

  const attribution = `Photo by ${photo.photographer} on Pexels`;

  return {
    mimeType,
    base64: buf.toString("base64"),
    source: "pexels",
    model: `pexels:${photo.id}`,
    directUrl,
    attribution,
  };
}

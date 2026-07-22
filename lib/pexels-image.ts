export type PexelsPhoto = {
  url: string;
  photographer: string;
};

export async function fetchPexelsPhoto(
  query: string,
  aspectHint?: string,
): Promise<PexelsPhoto | null> {
  const key = process.env.PEXELS_API_KEY?.trim();
  if (!key) return null;

  const orientation =
    aspectHint === "9:16" || /portrait|vertical/i.test(query)
      ? "portrait"
      : aspectHint === "1:1" || /square/i.test(query)
        ? "square"
        : "landscape";

  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=${orientation}`,
    {
      headers: { Authorization: key },
      next: { revalidate: 3600 },
    },
  );

  if (!res.ok) return null;

  const data = (await res.json()) as {
    photos?: Array<{
      src: { large2x?: string; large?: string; original?: string };
      photographer: string;
    }>;
  };

  const photo = data.photos?.[0];
  if (!photo) return null;

  const url = photo.src.large2x || photo.src.large || photo.src.original;
  if (!url) return null;

  return { url, photographer: photo.photographer };
}

export async function downloadAsBase64(
  url: string,
): Promise<{ mimeType: string; base64: string } | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const mimeType = res.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { mimeType, base64: buffer.toString("base64") };
}

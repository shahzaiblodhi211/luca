import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const key = process.env.PEXELS_API_KEY?.trim();
  if (!key) {
    return NextResponse.json({ error: "PEXELS_API_KEY is not set" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query")?.trim();
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const perPage = Math.min(Number(searchParams.get("per_page") || 8), 20);

  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}`,
      {
        headers: { Authorization: key },
        next: { revalidate: 3600 },
      },
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Pexels ${res.status}: ${text.slice(0, 200)}` },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      photos: Array<{
        id: number;
        alt: string;
        src: { large: string; medium: string; original: string };
        photographer: string;
      }>;
    };

    return NextResponse.json({
      photos: data.photos.map((p) => ({
        id: p.id,
        alt: p.alt,
        url: p.src.large || p.src.medium,
        original: p.src.original,
        photographer: p.photographer,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Pexels request failed" },
      { status: 502 },
    );
  }
}

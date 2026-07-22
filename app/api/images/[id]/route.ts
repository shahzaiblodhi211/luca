import { NextResponse } from "next/server";
import { getImageById } from "@/lib/image-store";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const image = await getImageById(id);
    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    const buffer = Buffer.from(image.base64, "base64");
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": image.mimeType || "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load image" },
      { status: 500 },
    );
  }
}

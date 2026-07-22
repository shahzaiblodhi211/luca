import { NextResponse } from "next/server";
import {
  getAttachmentLimits,
  saveAttachment,
} from "@/lib/attachments";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const files = form
      .getAll("files")
      .filter((f): f is File => typeof f !== "string" && Boolean(f));

    const { maxFiles, maxBytes } = getAttachmentLimits();
    if (!files.length) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }
    if (files.length > maxFiles) {
      return NextResponse.json(
        { error: `Max ${maxFiles} files per upload` },
        { status: 400 },
      );
    }

    const attachments = [];
    for (const file of files) {
      if (file.size > maxBytes) {
        return NextResponse.json(
          { error: `${file.name} exceeds ${Math.round(maxBytes / (1024 * 1024))}MB` },
          { status: 400 },
        );
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const saved = await saveAttachment({
        name: file.name || "upload",
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        buffer,
      });
      attachments.push(saved);
    }

    return NextResponse.json({ attachments });
  } catch (err) {
    console.error("[upload]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    );
  }
}

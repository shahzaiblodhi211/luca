"use client";

import {
  Attachment,
  AttachmentPreview,
  Attachments,
  type AttachmentData,
} from "@/components/ai-elements/attachments";
import type { ChatAttachment } from "@/lib/types";

function isCloneScreenshot(file: ChatAttachment) {
  return file.kind === "image" && /^clone-screenshot/i.test(file.name);
}

function toAttachmentData(file: ChatAttachment): AttachmentData {
  return {
    id: file.id,
    type: "file",
    url: file.url,
    mediaType:
      file.mimeType && file.mimeType !== "application/octet-stream"
        ? file.mimeType
        : file.kind === "image"
          ? "image/jpeg"
          : file.mimeType || "application/octet-stream",
    filename: file.name,
  };
}

export function AttachmentChips({
  attachments,
}: {
  attachments?: ChatAttachment[];
}) {
  if (!attachments?.length) return null;

  const cloneShots = attachments.filter(isCloneScreenshot);
  const other = attachments.filter((f) => !isCloneScreenshot(f));

  return (
    <div className="mb-2 flex flex-col gap-3">
      {cloneShots.map((file) => (
        <a
          key={file.id}
          href={file.url}
          target="_blank"
          rel="noreferrer"
          className="group block overflow-hidden rounded-xl border border-sky-500/30 bg-sky-950/40"
        >
          <div className="flex items-center justify-between gap-2 border-b border-sky-500/20 px-3 py-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-sky-300">
              Full page we&apos;re cloning
            </span>
            <span className="truncate text-[11px] text-sky-200/70">
              Scroll to see every section · open for full size
            </span>
          </div>
          <div className="max-h-[min(70vh,900px)] overflow-y-auto bg-zinc-950">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={file.url}
              alt="Full-page screenshot of the site being cloned"
              className="w-full object-contain object-top"
            />
          </div>
          <p className="px-3 py-2 text-[12px] leading-snug text-sky-100/80">
            Scroll this image — Luca AI must clone the entire page (not only the
            hero).
          </p>
        </a>
      ))}

      {other.length > 0 ? (
        <Attachments variant="grid">
          {other.map((file) => (
            <Attachment key={file.id} data={toAttachmentData(file)}>
              <AttachmentPreview />
            </Attachment>
          ))}
        </Attachments>
      ) : null}
    </div>
  );
}

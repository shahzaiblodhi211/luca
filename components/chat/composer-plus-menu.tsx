"use client";

import { CloudUpload, Lock } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

function FigmaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 38 57" aria-hidden className={cn("h-4 w-[11px]", className)}>
      <path fill="#1ABCFE" d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" />
      <path fill="#0ACF83" d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" />
      <path fill="#FF7262" d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" />
      <path fill="#F24E1E" d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" />
      <path fill="#A259FF" d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" />
    </svg>
  );
}

const rowClass =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-zinc-800";

export function ComposerPlusMenu({
  open,
  onClose,
  onUpload,
  onImportFigma,
  figmaLocked = false,
}: {
  open: boolean;
  onClose: () => void;
  onUpload: () => void;
  onImportFigma: () => void;
  figmaLocked?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className="absolute bottom-[calc(100%+8px)] left-0 z-50 w-[272px] rounded-xl border border-zinc-800 bg-zinc-950 p-1.5 shadow-2xl"
    >
      <button
        type="button"
        onClick={() => {
          onImportFigma();
          onClose();
        }}
        className={rowClass}
      >
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-900",
            figmaLocked && "opacity-80",
          )}
        >
          <FigmaMark />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block text-[13px] font-medium leading-tight",
              figmaLocked ? "text-zinc-300" : "text-zinc-100",
            )}
          >
            Import from Figma
          </span>
          {figmaLocked ? (
            <span className="mt-0.5 block text-[11px] leading-tight text-zinc-500">
              Available on Plus and Pro
            </span>
          ) : (
            <span className="mt-0.5 block text-[11px] leading-tight text-zinc-500">
              Paste a file or frame link
            </span>
          )}
        </span>
        {figmaLocked ? (
          <Lock className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        ) : null}
      </button>

      <button
        type="button"
        onClick={() => {
          onUpload();
          onClose();
        }}
        className={rowClass}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-900">
          <CloudUpload className="h-4 w-4 text-zinc-400" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium leading-tight text-zinc-100">
            Upload from computer
          </span>
          <span className="mt-0.5 block text-[11px] leading-tight text-zinc-500">
            Images, PDFs, and files
          </span>
        </span>
      </button>
    </div>
  );
}

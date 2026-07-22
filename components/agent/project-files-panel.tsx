"use client";

import { FileCode2 } from "lucide-react";
import { cn } from "@/lib/utils";

type FileMeta = { path: string; language?: string };

/** Compact Luca AI project file list so users see what is being written/edited. */
export function ProjectFilesPanel({
  projectId,
  files,
  isStreaming = false,
  className,
}: {
  projectId: string;
  files: FileMeta[];
  isStreaming?: boolean;
  className?: string;
}) {
  // Never show an empty project shell ("Waiting for files…") — greetings / Q&A
  // must not render this card. Only appear once real files exist.
  if (!files.length) return null;

  return (
    <div
      className={cn(
        "rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileCode2 className="h-3.5 w-3.5 shrink-0 text-sky-400" />
          <span className="truncate text-xs font-medium text-zinc-200">
            {projectId || "Code Project"}
          </span>
        </div>
        <span className="shrink-0 text-[10px] text-zinc-500">
          {isStreaming ? "Editing…" : `${files.length} file${files.length === 1 ? "" : "s"}`}
        </span>
      </div>
      <ul className="space-y-1">
        {files.map((f) => (
          <li
            key={f.path}
            className="flex items-center gap-2 truncate font-mono text-[11px] text-zinc-400"
          >
            <span className="h-1 w-1 shrink-0 rounded-full bg-emerald-500" />
            {f.path}
          </li>
        ))}
      </ul>
    </div>
  );
}

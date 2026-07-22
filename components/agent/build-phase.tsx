"use client";

import { useState } from "react";
import {
  Check,
  ChevronRight,
  CircleDashed,
  FileCode2,
  Package,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BuildCommandItem, BuildFileItem, BuildPhasePart } from "@/lib/types";

function FileRow({ file }: { file: BuildFileItem }) {
  const busy = file.status === "in_progress";
  const Icon =
    file.action === "delete" ? Trash2 : busy ? CircleDashed : FileCode2;
  return (
    <li className="flex items-center gap-2 py-0.5 font-mono text-[11px] text-zinc-400">
      {busy ? (
        <CircleDashed className="h-3 w-3 shrink-0 animate-spin text-sky-400" />
      ) : (
        <Check className="h-3 w-3 shrink-0 text-emerald-500" />
      )}
      <Icon className="h-3 w-3 shrink-0 opacity-50" />
      <span className="min-w-0 truncate">{file.path}</span>
      <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-zinc-600">
        {file.action}
      </span>
      {file.linesDelta != null && file.status === "done" ? (
        <span
          className={cn(
            "shrink-0 text-[10px] tabular-nums",
            file.linesDelta >= 0 ? "text-emerald-600" : "text-rose-500",
          )}
        >
          {file.linesDelta >= 0 ? `+${file.linesDelta}` : file.linesDelta}
        </span>
      ) : null}
    </li>
  );
}

function CommandRow({ cmd }: { cmd: BuildCommandItem }) {
  const busy = cmd.status === "in_progress";
  return (
    <li className="flex items-center gap-2 py-0.5 font-mono text-[11px] text-zinc-400">
      {busy ? (
        <CircleDashed className="h-3 w-3 shrink-0 animate-spin text-amber-400" />
      ) : (
        <Check className="h-3 w-3 shrink-0 text-emerald-500" />
      )}
      <Package className="h-3 w-3 shrink-0 opacity-50" />
      <span className="min-w-0 truncate">{cmd.name}</span>
      {cmd.detail ? (
        <span className="ml-auto shrink-0 truncate text-[10px] text-zinc-600">
          {cmd.detail}
        </span>
      ) : null}
    </li>
  );
}

/** Collapsed-by-default phase group (narrative + files/commands). */
export function BuildPhase({
  phase,
  defaultOpen = false,
  className,
}: {
  phase: BuildPhasePart;
  defaultOpen?: boolean;
  className?: string;
}) {
  const busy =
    phase.files.some((f) => f.status === "in_progress") ||
    phase.commands.some((c) => c.status === "in_progress");
  const [open, setOpen] = useState(defaultOpen || busy);
  const fileCount = phase.files.length;
  const cmdCount = phase.commands.length;

  return (
    <div
      className={cn(
        "rounded-lg border border-zinc-800/80 bg-zinc-900/40",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left"
      >
        <ChevronRight
          className={cn(
            "mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform",
            open && "rotate-90",
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug text-zinc-200">{phase.text}</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {busy
              ? "Working…"
              : [
                  fileCount
                    ? `${fileCount} file${fileCount === 1 ? "" : "s"}`
                    : null,
                  cmdCount
                    ? `${cmdCount} command${cmdCount === 1 ? "" : "s"}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
          </p>
        </div>
      </button>
      {open ? (
        <ul className="space-y-0.5 border-t border-zinc-800/60 px-3 py-2">
          {phase.commands.map((c) => (
            <CommandRow key={c.name} cmd={c} />
          ))}
          {phase.files.map((f) => (
            <FileRow key={f.path} file={f} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

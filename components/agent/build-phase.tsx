"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  FileCode2,
  FileText,
  Image as ImageIcon,
  Package,
  Trash2,
} from "lucide-react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { cn } from "@/lib/utils";
import type { BuildCommandItem, BuildFileItem, BuildPhasePart } from "@/lib/types";
import { prettyFileLabel } from "@/lib/agent/pretty-file-label";

function ReactMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="1.65" fill="currentColor" stroke="none" />
      <ellipse cx="12" cy="12" rx="10" ry="4.15" />
      <ellipse cx="12" cy="12" rx="10" ry="4.15" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="10" ry="4.15" transform="rotate(120 12 12)" />
    </svg>
  );
}

function CssMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M5.2 3.2h13.6L17.4 20.2 12 21.8 6.6 20.2 5.2 3.2Z"
        fill="#264de4"
      />
      <path d="M12 4.4V20.6l4.35-1.25L17.5 4.4H12Z" fill="#2965f1" />
      <path
        d="M12 11.1H8.85l.18 1.85H12v1.9H7.35l-.08-.7-.48-5.05H12v2Zm0 5.55.02.01-3.08-.86-.2-2.2H6.82l.38 4.28L12 19.1v-2.45Zm0-5.55V9.2h4.55l.16 1.9H12Zm4.28 3.35-.16 1.72L12 16.66v2.45l4.78-1.36.5-5.6h-1.9l-.1 1.85Z"
        fill="#fff"
      />
    </svg>
  );
}

function fileTypeIcon(path: string) {
  const lower = path.toLowerCase();
  if (/\.(tsx|jsx)$/.test(lower)) {
    return <ReactMark className="h-4 w-4 shrink-0 text-[#61dafb]" />;
  }
  if (/\.css$/.test(lower)) {
    return <CssMark className="h-4 w-4 shrink-0" />;
  }
  if (/\.(ts|mts|cts)$/.test(lower)) {
    return <FileCode2 className="h-4 w-4 shrink-0 text-blue-400" />;
  }
  if (/\.(js|mjs|cjs)$/.test(lower)) {
    return <FileCode2 className="h-4 w-4 shrink-0 text-yellow-400" />;
  }
  if (/\.json$/.test(lower)) {
    return <FileCode2 className="h-4 w-4 shrink-0 text-amber-400" />;
  }
  if (/\.(md|mdx|txt)$/.test(lower)) {
    return <FileText className="h-4 w-4 shrink-0 text-zinc-400" />;
  }
  if (/\.(png|jpe?g|webp|gif|svg|ico|avif)$/.test(lower)) {
    return <ImageIcon className="h-4 w-4 shrink-0 text-violet-400" />;
  }
  return <FileCode2 className="h-4 w-4 shrink-0 text-zinc-400" />;
}

function FileRow({ file }: { file: BuildFileItem }) {
  const name = file.path.split("/").pop() || file.path;
  return (
    <li className="flex min-w-0 items-center gap-2.5 py-1">
      {file.action === "delete" ? (
        <Trash2 className="h-4 w-4 shrink-0 text-rose-400/80" />
      ) : (
        fileTypeIcon(file.path)
      )}
      <span
        className={cn(
          "shrink-0 text-[14px] font-semibold leading-none",
          file.action === "delete" ? "text-zinc-500 line-through" : "text-white",
        )}
      >
        {name}
      </span>
      <span className="min-w-0 truncate text-[13.5px] leading-none text-zinc-500">
        {file.path}
      </span>
    </li>
  );
}

function CommandRow({ cmd }: { cmd: BuildCommandItem }) {
  return (
    <li className="flex min-w-0 items-center gap-2.5 py-1">
      <Package className="h-4 w-4 shrink-0 text-orange-300/90" />
      <span className="min-w-0 truncate text-[14px] font-semibold leading-none text-white">
        {cmd.name}
      </span>
    </li>
  );
}

function phaseHeading(phase: BuildPhasePart, creating: boolean) {
  const file = phase.files[0];
  const action = file?.action;

  if (phase.commands.length && !file) {
    return creating ? "Installing packages" : "Installed packages";
  }

  if (file) {
    const label = prettyFileLabel(file.path);
    if (action === "update") {
      return creating ? `Updating ${label}` : `Updated ${label}`;
    }
    if (action === "delete") {
      return creating ? `Removing ${label}` : `Removed ${label}`;
    }
    return creating ? `Creating ${label}` : `Created ${label}`;
  }

  return creating ? "Creating files" : "Created files";
}

export function BuildPhase({
  phase,
  defaultOpen = false,
  className,
}: {
  phase: BuildPhasePart;
  defaultOpen?: boolean;
  className?: string;
}) {
  if (phase.files.length > 1) {
    return (
      <div className={cn("space-y-0.5", className)}>
        {phase.files.map((file) => (
          <BuildPhaseRow
            key={file.path}
            defaultOpen={defaultOpen}
            phase={{
              ...phase,
              id: `${phase.id}-${file.path}`,
              text: prettyFileLabel(file.path),
              files: [file],
              commands: [],
            }}
          />
        ))}
        {phase.commands.length > 0 ? (
          <BuildPhaseRow
            defaultOpen={defaultOpen}
            phase={{
              ...phase,
              id: `${phase.id}-cmds`,
              text: "Installing packages",
              files: [],
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <BuildPhaseRow
      phase={phase}
      defaultOpen={defaultOpen}
      className={className}
    />
  );
}

function BuildPhaseRow({
  phase,
  defaultOpen = false,
  className,
}: {
  phase: BuildPhasePart;
  defaultOpen?: boolean;
  className?: string;
}) {
  const doneFiles = phase.files.filter((f) => f.status === "done");
  const doneCommands = phase.commands.filter((c) => c.status === "done");
  const creatingNow =
    phase.files.some((f) => f.status === "in_progress") ||
    phase.commands.some((c) => c.status === "in_progress");
  const [holdCreating, setHoldCreating] = useState(creatingNow);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (creatingNow) {
      setHoldCreating(true);
      return;
    }
    const t = setTimeout(() => setHoldCreating(false), 420);
    return () => clearTimeout(t);
  }, [creatingNow]);

  const creating = creatingNow || holdCreating;
  const heading = phaseHeading(phase, creating);
  const hasRows = doneFiles.length > 0 || doneCommands.length > 0;

  useEffect(() => {
    if (!creating && hasRows && defaultOpen) setOpen(true);
  }, [creating, hasRows, defaultOpen]);

  if (!creating && doneFiles.length === 0 && doneCommands.length === 0) {
    return null;
  }

  if (creating) {
    return (
      <div className={cn("flex items-center gap-1.5 py-1", className)}>
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          <FileText className="h-3.5 w-3.5 text-zinc-600" />
        </span>
        <Shimmer
          as="span"
          className="min-w-0 text-[14.5px] font-normal"
          duration={1.1}
        >
          {heading}
        </Shimmer>
      </div>
    );
  }

  return (
    <div className={cn("relative py-0.5", className)}>
      {open && hasRows ? (
        <span
          aria-hidden
          className="absolute bottom-1 left-[7px] top-[18px] w-px -translate-x-1/2 bg-zinc-600"
        />
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-center gap-1.5 py-0.5 text-left"
      >
        <span className="relative z-[1] flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
          ) : (
            <FileText className="h-3.5 w-3.5 text-zinc-500" />
          )}
        </span>
        <span className="min-w-0 text-[14.5px] font-normal text-zinc-400 transition-colors group-hover:text-zinc-300">
          {heading}
        </span>
      </button>
      {open && hasRows ? (
        <ul className="space-y-0 pl-[22px]">
          {doneCommands.map((c) => (
            <CommandRow key={c.name} cmd={c} />
          ))}
          {doneFiles.map((f) => (
            <FileRow key={f.path} file={f} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

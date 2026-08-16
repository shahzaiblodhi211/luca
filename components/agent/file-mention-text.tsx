"use client";

import type { ReactNode } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { prettyFileLabel } from "@/lib/agent/pretty-file-label";
import { cn } from "@/lib/utils";
import type { AssistantPart } from "@/lib/types";

const MENTION =
  /(`[^`]+`|(?:app|components|lib|public|styles|hooks|utils)\/[\w./-]+\.[A-Za-z0-9]+)/g;

const FILE_PATH =
  /^(?:[\w.-]+\/)+[\w.-]+\.[A-Za-z0-9]+$|^[\w.-]+\.(tsx|ts|jsx|js|css|json|md|mjs|cjs)$/i;

export function doneFilePaths(parts?: AssistantPart[]): Set<string> {
  const done = new Set<string>();
  if (!parts) return done;
  for (const part of parts) {
    if (part.type !== "phase") continue;
    for (const file of part.files) {
      if (file.status !== "done") continue;
      const path = file.path.replace(/^\/+/, "");
      done.add(path);
      done.add(file.path);
      const name = path.split("/").pop();
      if (name) done.add(name);
    }
  }
  return done;
}

function isFilePath(value: string): boolean {
  return FILE_PATH.test(value.trim());
}

function titleCaseName(label: string): string {
  return label.replace(/\b\w/g, (c) => c.toUpperCase());
}

function displayName(path: string, before: string): string {
  const name = prettyFileLabel(path);
  if (/(?:I will now write|will now write)\s+$/i.test(before)) {
    return titleCaseName(name);
  }
  return name;
}

/** Swap `components/footer.tsx` for "Footer" / "footer" in visible chat text. */
export function humanizeFileMentions(text: string): string {
  return text.replace(new RegExp(MENTION.source, "g"), (raw, offset) => {
    const path = raw.startsWith("`") ? raw.slice(1, -1) : raw;
    if (!isFilePath(path)) return raw;
    return displayName(path, text.slice(0, offset));
  });
}

function mentionPending(
  raw: string,
  done: Set<string>,
  streaming: boolean,
): boolean {
  if (!streaming) return false;
  const path = raw.replace(/^\/+/, "").trim();
  if (done.has(path) || done.has(path.split("/").pop() || "")) return false;
  return isFilePath(path);
}

export function FileMentionText({
  text,
  donePaths,
  streaming = false,
  className,
}: {
  text: string;
  donePaths: Set<string>;
  streaming?: boolean;
  className?: string;
}) {
  const nodes: ReactNode[] = [];
  let last = 0;
  const re = new RegExp(MENTION.source, "g");
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    const raw = match[0];
    const path = raw.startsWith("`") ? raw.slice(1, -1) : raw;
    if (isFilePath(path)) {
      const name = displayName(path, text.slice(0, match.index));
      const pending = mentionPending(path, donePaths, streaming);
      nodes.push(
        pending ? (
          <Shimmer
            key={`${path}-${i++}`}
            as="span"
            className="align-baseline text-[15.5px] font-normal"
            duration={1.1}
          >
            {name}
          </Shimmer>
        ) : (
          <span key={`${path}-${i++}`}>{name}</span>
        ),
      );
    } else {
      nodes.push(raw);
    }
    last = match.index + raw.length;
  }

  if (last < text.length) nodes.push(text.slice(last));

  return (
    <p
      className={cn(
        "whitespace-pre-wrap text-[15.5px] leading-7 text-[#ececec]",
        className,
      )}
    >
      {nodes}
    </p>
  );
}

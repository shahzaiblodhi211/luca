"use client";

import { Streamdown } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { cn } from "@/lib/utils";

const plugins = { cjk, code, math, mermaid };

/**
 * Clean markdown renderer for assistant text.
 * Uses Streamdown (AI Elements MessageResponse engine) without caret / fake animation.
 */
export function ResponseMarkdown({
  children,
  isStreaming = false,
  className,
}: {
  children: string;
  isStreaming?: boolean;
  className?: string;
}) {
  const text = children ?? "";
  if (!text.trim()) {
    return isStreaming ? (
      <span className="inline-block h-4 w-1.5 animate-pulse rounded-sm bg-zinc-500/80" />
    ) : null;
  }

  return (
    <Streamdown
      className={cn(
        "size-full text-[15px] leading-relaxed text-foreground",
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        "[&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-xl [&_h1]:font-semibold",
        "[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold",
        "[&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold",
        "[&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5",
        "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_strong]:font-semibold [&_a]:text-sky-400 [&_a]:underline",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em]",
        "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted/50 [&_pre]:p-3",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        className,
      )}
      plugins={plugins}
      parseIncompleteMarkdown={isStreaming}
      mode={isStreaming ? "streaming" : "static"}
      isAnimating={false}
      animated={false}
      controls={false}
    >
      {text}
    </Streamdown>
  );
}

"use client";

import { MessageResponse } from "@/components/ai-elements/message";
import { cn } from "@/lib/utils";

export const ASSISTANT_MARKDOWN_CLASS =
  "markdown prose dark:prose-invert wrap-break-word w-full max-w-none dark markdown-new-styling font-normal tracking-normal";

/**
 * Assistant markdown via AI Elements MessageResponse (Streamdown).
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
    <div className={cn(ASSISTANT_MARKDOWN_CLASS, className)}>
      <MessageResponse
        className={cn(
          "size-full font-[inherit] text-[inherit] leading-[inherit] tracking-[inherit]",
          "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
          "[&_li>p]:my-0 [&_li>p:first-child]:mt-0 [&_li>p:last-child]:mb-0",
        )}
        parseIncompleteMarkdown={isStreaming}
        mode={isStreaming ? "streaming" : "static"}
        isAnimating={false}
        animated={false}
        controls={false}
      >
        {text}
      </MessageResponse>
    </div>
  );
}

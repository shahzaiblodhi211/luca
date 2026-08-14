"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MessageAction,
  MessageActions,
} from "@/components/ai-elements/message";
import {
  CheckIcon,
  CopyIcon,
  RefreshCcwIcon,
  ShareIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "lucide-react";

export function MessageToolbarActions({
  content,
  onRetry,
}: {
  content: string;
  onRetry?: () => void;
}) {
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const handleCopy = useCallback(() => {
    if (!content.trim()) return;
    void navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 1000);
    });
  }, [content]);

  const handleShare = useCallback(async () => {
    if (!content.trim()) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text: content });
      } catch {
        /* user dismissed */
      }
      return;
    }
    void navigator.clipboard.writeText(content);
  }, [content]);

  return (
    <MessageActions className="mt-1">
      <MessageAction
        label={copied ? "Copied" : "Copy"}
        tooltip={copied ? "Copied!" : "Copy to clipboard"}
        onClick={handleCopy}
        disabled={!content.trim()}
      >
        {copied ? (
          <CheckIcon className="size-4 stroke-[1.5] text-message-action-icon-hover" />
        ) : (
          <CopyIcon className="size-4 stroke-[1.5]" />
        )}
      </MessageAction>
      <MessageAction
        label="Like"
        tooltip="Like this response"
        onClick={() => {
          setLiked((v) => !v);
          if (!liked) setDisliked(false);
        }}
      >
        <ThumbsUpIcon
          className="size-4 stroke-[1.5]"
          fill={liked ? "currentColor" : "none"}
        />
      </MessageAction>
      <MessageAction
        label="Dislike"
        tooltip="Dislike this response"
        onClick={() => {
          setDisliked((v) => !v);
          if (!disliked) setLiked(false);
        }}
      >
        <ThumbsDownIcon
          className="size-4 stroke-[1.5]"
          fill={disliked ? "currentColor" : "none"}
        />
      </MessageAction>
      <MessageAction
        label="Share"
        tooltip="Share response"
        onClick={() => void handleShare()}
        disabled={!content.trim()}
      >
        <ShareIcon className="size-4 stroke-[1.5]" />
      </MessageAction>
      {onRetry ? (
        <MessageAction
          label="Retry"
          tooltip="Regenerate response"
          onClick={onRetry}
        >
          <RefreshCcwIcon className="size-4 stroke-[1.5]" />
        </MessageAction>
      ) : null}
    </MessageActions>
  );
}

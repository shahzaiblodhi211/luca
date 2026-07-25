"use client";

import { useCallback, useState } from "react";
import {
  MessageAction,
  MessageActions,
} from "@/components/ai-elements/message";
import {
  CopyIcon,
  RefreshCcwIcon,
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

  const handleCopy = useCallback(() => {
    if (!content.trim()) return;
    void navigator.clipboard.writeText(content);
  }, [content]);

  return (
    <MessageActions className="mt-2 opacity-80 transition-opacity group-hover:opacity-100">
      {onRetry ? (
        <MessageAction
          label="Retry"
          tooltip="Regenerate response"
          onClick={onRetry}
        >
          <RefreshCcwIcon className="size-4" />
        </MessageAction>
      ) : null}
      <MessageAction
        label="Like"
        tooltip="Like this response"
        onClick={() => {
          setLiked((v) => !v);
          if (!liked) setDisliked(false);
        }}
      >
        <ThumbsUpIcon
          className="size-4"
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
          className="size-4"
          fill={disliked ? "currentColor" : "none"}
        />
      </MessageAction>
      <MessageAction
        label="Copy"
        tooltip="Copy to clipboard"
        onClick={handleCopy}
        disabled={!content.trim()}
      >
        <CopyIcon className="size-4" />
      </MessageAction>
    </MessageActions>
  );
}

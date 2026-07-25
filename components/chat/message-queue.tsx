"use client";

import type { QueueMessage } from "@/components/ai-elements/queue";
import {
  Queue,
  QueueItem,
  QueueItemAction,
  QueueItemActions,
  QueueItemAttachment,
  QueueItemContent,
  QueueItemFile,
  QueueItemImage,
  QueueItemIndicator,
  QueueList,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from "@/components/ai-elements/queue";
import type { ChatAttachment } from "@/lib/types";
import type { ThinkingLevel } from "@/lib/thinking-level";
import type { LucaModelTier } from "@/lib/luca-model-tier";
import { ArrowUp, Trash2 } from "lucide-react";
import { memo, useCallback } from "react";

export type QueuedPrompt = {
  id: string;
  text: string;
  attachments: ChatAttachment[];
  thinkingLevel: ThinkingLevel;
  lucaModelTier: LucaModelTier;
};

export function queuedPromptToMessage(item: QueuedPrompt): QueueMessage {
  const parts: QueueMessage["parts"] = [];
  if (item.text.trim()) {
    parts.push({ type: "text", text: item.text.trim() });
  }
  for (const file of item.attachments) {
    parts.push({
      type: "file",
      url: file.url,
      filename: file.name,
      mediaType: file.mimeType,
    });
  }
  if (!parts.length) {
    parts.push({ type: "text", text: "(queued message)" });
  }
  return { id: item.id, parts };
}

interface MessageActionsProps {
  messageId: string;
  onRemove: (e: React.MouseEvent, id: string) => void;
  onSend: (e: React.MouseEvent, id: string) => void;
}

const MessageActions = memo(
  ({ messageId, onRemove, onSend }: MessageActionsProps) => {
    const handleRemove = useCallback(
      (e: React.MouseEvent) => onRemove(e, messageId),
      [onRemove, messageId],
    );
    const handleSend = useCallback(
      (e: React.MouseEvent) => onSend(e, messageId),
      [onSend, messageId],
    );
    return (
      <QueueItemActions>
        <QueueItemAction
          aria-label="Remove from queue"
          onClick={handleRemove}
          title="Remove from queue"
        >
          <Trash2 size={12} />
        </QueueItemAction>
        <QueueItemAction aria-label="Send now" onClick={handleSend}>
          <ArrowUp size={14} />
        </QueueItemAction>
      </QueueItemActions>
    );
  },
);

MessageActions.displayName = "MessageActions";

export function MessageQueue({
  items,
  onRemove,
  onSendNow,
}: {
  items: QueuedPrompt[];
  onRemove: (id: string) => void;
  onSendNow: (id: string) => void;
}) {
  const handleMessageRemove = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      onRemove(id);
    },
    [onRemove],
  );

  const handleMessageSend = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      onSendNow(id);
    },
    [onSendNow],
  );

  if (!items.length) return null;

  const messages = items.map(queuedPromptToMessage);

  return (
    <Queue>
      <QueueSection>
        <QueueSectionTrigger>
          <QueueSectionLabel count={messages.length} label="Queued" />
        </QueueSectionTrigger>
        <QueueSectionContent>
          <QueueList>
            {messages.map((message) => {
              const summary = (() => {
                const textParts = message.parts.filter((p) => p.type === "text");
                const text = textParts
                  .map((p) => p.text)
                  .join(" ")
                  .trim();
                return text || "(queued message)";
              })();

              const hasFiles = message.parts.some(
                (p) => p.type === "file" && p.url,
              );

              return (
                <QueueItem key={message.id}>
                  <div className="flex items-center gap-2">
                    <QueueItemIndicator />
                    <QueueItemContent>{summary}</QueueItemContent>
                    <MessageActions
                      messageId={message.id}
                      onRemove={handleMessageRemove}
                      onSend={handleMessageSend}
                    />
                  </div>
                  {hasFiles ? (
                    <QueueItemAttachment>
                      {message.parts
                        .filter((p) => p.type === "file" && p.url)
                        .map((file) => {
                          if (file.mediaType?.startsWith("image/") && file.url) {
                            return (
                              <QueueItemImage
                                alt={file.filename || "attachment"}
                                key={file.url}
                                src={file.url}
                              />
                            );
                          }
                          return (
                            <QueueItemFile key={file.url}>
                              {file.filename || "file"}
                            </QueueItemFile>
                          );
                        })}
                    </QueueItemAttachment>
                  ) : null}
                </QueueItem>
              );
            })}
          </QueueList>
        </QueueSectionContent>
      </QueueSection>
    </Queue>
  );
}

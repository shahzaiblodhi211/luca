"use client";

import { ArrowUp, FileText, Loader2, Paperclip, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  THINKING_LEVEL_HINTS,
  THINKING_LEVEL_LABELS,
  THINKING_LEVELS,
  parseThinkingLevel,
  readStoredThinkingLevel,
  storeThinkingLevel,
  type ThinkingLevel,
} from "@/lib/thinking-level";
import { cn } from "@/lib/utils";
import type { ChatAttachment } from "@/lib/types";

export type PromptSubmitPayload = {
  text: string;
  attachments: ChatAttachment[];
  thinkingLevel: ThinkingLevel;
};

type PendingFile = {
  localId: string;
  file: File;
  previewUrl?: string;
};

async function uploadFiles(files: File[]): Promise<ChatAttachment[]> {
  const { prepareFilesForUpload } = await import("@/lib/client-image");
  const prepared = await prepareFilesForUpload(files);
  const form = new FormData();
  for (const file of prepared) form.append("files", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const data = (await res.json().catch(() => null)) as {
    attachments?: ChatAttachment[];
    error?: string;
  } | null;
  if (!res.ok) throw new Error(data?.error || "Upload failed");
  return data?.attachments ?? [];
}

export function PromptForm({
  onSubmit,
  disabled,
  placeholder = "Ask Luca AI to build anything… paste a URL to clone, or attach a screenshot",
  autoFocus,
  compact,
  initialThinkingLevel,
}: {
  onSubmit: (payload: PromptSubmitPayload) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
  /** Chat-saved level; falls back to last local choice / LOW. */
  initialThinkingLevel?: string | null;
}) {
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>(() =>
    parseThinkingLevel(initialThinkingLevel, "LOW"),
  );
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (initialThinkingLevel) {
      setThinkingLevel(parseThinkingLevel(initialThinkingLevel));
      return;
    }
    setThinkingLevel(readStoredThinkingLevel());
  }, [initialThinkingLevel]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  useEffect(() => {
    return () => {
      for (const f of pendingFiles) {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      }
    };
  }, [pendingFiles]);

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    if (!incoming.length) return;
    setPendingFiles((prev) => {
      const next = [...prev];
      for (const file of incoming) {
        if (next.length >= 6) break;
        next.push({
          localId: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
          file,
          previewUrl: file.type.startsWith("image/")
            ? URL.createObjectURL(file)
            : undefined,
        });
      }
      return next;
    });
  }

  function removePending(localId: string) {
    setPendingFiles((prev) => {
      const target = prev.find((p) => p.localId === localId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.localId !== localId);
    });
  }

  async function handleSubmit() {
    const trimmed = value.trim();
    if ((!trimmed && !pendingFiles.length) || disabled || pending || uploading) {
      return;
    }

    setPending(true);
    // Clear immediately so the composer feels responsive
    const filesToUpload = [...pendingFiles];
    setValue("");
    setPendingFiles((prev) => {
      for (const f of prev) {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      }
      return [];
    });
    try {
      let attachments: ChatAttachment[] = [];
      if (filesToUpload.length) {
        setUploading(true);
        attachments = await uploadFiles(filesToUpload.map((p) => p.file));
        setUploading(false);
      }
      // Release the send spinner immediately — the parent locks the form with
      // `disabled={busy}` for the whole agent run. Awaiting onSubmit here kept
      // the spinner spinning after the reply finished (during refreshChat).
      setPending(false);
      storeThinkingLevel(thinkingLevel);
      await onSubmit({ text: trimmed, attachments, thinkingLevel });
    } catch (err) {
      setUploading(false);
      setPending(false);
      alert(err instanceof Error ? err.message : "Failed to send");
    }
  }

  const canSend =
    (value.trim().length > 0 || pendingFiles.length > 0) &&
    !disabled &&
    !pending &&
    !uploading;

  return (
    <div
      className={cn(
        "relative w-full rounded-2xl border bg-zinc-900/90 shadow-2xl shadow-black/40 backdrop-blur transition",
        dragOver ? "border-emerald-500/70" : "border-zinc-700/80",
        compact ? "p-2" : "p-3",
      )}
      onDragEnter={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
      }}
    >
      {pendingFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2 px-1">
          {pendingFiles.map((item) => (
            <div
              key={item.localId}
              className="group relative flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950/80 px-2 py-1.5"
            >
              {item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.previewUrl}
                  alt={item.file.name}
                  className="h-10 w-10 rounded object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded bg-zinc-800 text-zinc-400">
                  <FileText className="h-4 w-4" />
                </div>
              )}
              <div className="max-w-[140px]">
                <p className="truncate text-xs text-zinc-200">{item.file.name}</p>
                <p className="text-[10px] text-zinc-500">
                  {Math.max(1, Math.round(item.file.size / 1024))} KB
                </p>
              </div>
              <button
                type="button"
                onClick={() => removePending(item.localId)}
                className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                aria-label="Remove file"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        ref={ref}
        value={value}
        disabled={disabled || pending}
        placeholder={placeholder}
        rows={1}
        onChange={(e) => setValue(e.target.value)}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files || []);
          if (files.length) {
            e.preventDefault();
            addFiles(files);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleSubmit();
          }
        }}
        className={cn(
          "w-full resize-none bg-transparent px-2 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500",
          compact ? "min-h-[40px]" : "min-h-[56px]",
        )}
      />

      <div className="flex items-center justify-between gap-2 px-1 pt-1">
        <div className="flex min-w-0 items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,.txt,.md,.csv,.json,.js,.jsx,.ts,.tsx,.css,.html,.svg,.pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={disabled || pending || uploading}
            onClick={() => fileRef.current?.click()}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-700 text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-40"
            title="Upload images or files"
            aria-label="Upload images or files"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <label className="flex min-w-0 items-center gap-1.5">
            <span className="hidden text-[11px] text-zinc-500 sm:inline">
              Think
            </span>
            <select
              value={thinkingLevel}
              disabled={disabled || pending}
              title={THINKING_LEVEL_HINTS[thinkingLevel]}
              aria-label="Thinking level"
              onChange={(e) => {
                const next = parseThinkingLevel(e.target.value);
                setThinkingLevel(next);
                storeThinkingLevel(next);
              }}
              className="h-8 max-w-[7.5rem] cursor-pointer appearance-none rounded-full border border-zinc-700 bg-zinc-950/80 px-2.5 pr-6 text-[11px] text-zinc-300 outline-none transition hover:border-zinc-500 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 0.55rem center",
              }}
            >
              {THINKING_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {THINKING_LEVEL_LABELS[level]}
                </option>
              ))}
            </select>
          </label>
          <p className="hidden truncate text-[11px] text-zinc-600 md:block">
            {uploading
              ? "Uploading…"
              : THINKING_LEVEL_HINTS[thinkingLevel]}
          </p>
        </div>
        <button
          type="button"
          disabled={!canSend}
          onClick={() => void handleSubmit()}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending || uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}

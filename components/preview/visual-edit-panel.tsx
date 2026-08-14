"use client";

import { RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VisualEditSelection } from "@/lib/preview/apply-visual-edit";

const WEIGHTS = [
  { label: "Light", value: "300" },
  { label: "Normal", value: "400" },
  { label: "Medium", value: "500" },
  { label: "Semibold", value: "600" },
  { label: "Bold", value: "700" },
];

type Draft = {
  text: string;
  fontSize: string;
  fontWeight: string;
  fontStyle: "normal" | "italic";
  color: string;
};

export function VisualEditPanel({
  selection,
  draft,
  onDraftChange,
  onApply,
  onReset,
  onClose,
  applying,
}: {
  selection: VisualEditSelection | null;
  draft: Draft | null;
  onDraftChange: (next: Draft) => void;
  onApply: () => void;
  onReset: () => void;
  onClose: () => void;
  applying?: boolean;
}) {
  if (!selection || !draft) {
    return (
      <aside className="flex w-[280px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-950">
        <div className="flex h-11 items-center justify-between border-b border-zinc-800 px-3">
          <span className="text-xs font-medium text-zinc-400">Edit</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-xs text-zinc-500">
          <p>Click an element in the preview to edit it.</p>
          <p className="text-zinc-600">
            Or describe changes in the chat — Luca will update the project.
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-950">
      <div className="flex h-11 items-center justify-between border-b border-zinc-800 px-3">
        <span className="truncate text-xs font-medium capitalize text-emerald-400/90">
          {selection.tagName}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <section className="space-y-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Content
          </h3>
          <textarea
            value={draft.text}
            onChange={(e) => onDraftChange({ ...draft, text: e.target.value })}
            rows={4}
            className="w-full resize-none rounded-lg border border-zinc-800 bg-input-bg px-2.5 py-2 text-xs text-zinc-200 outline-none ring-emerald-500/30 focus:border-emerald-600/50 focus:ring-2"
          />
        </section>

        <section className="mt-4 space-y-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Typography
          </h3>
          <label className="block text-[11px] text-zinc-500">Size</label>
          <input
            value={draft.fontSize.replace(/px$/, "")}
            onChange={(e) =>
              onDraftChange({
                ...draft,
                fontSize: e.target.value ? `${e.target.value.replace(/px$/, "")}px` : "",
              })
            }
            placeholder="18"
            className="h-8 w-full rounded-md border border-zinc-800 bg-input-bg px-2 text-xs text-zinc-200 outline-none focus:border-emerald-600/50"
          />
          <label className="block text-[11px] text-zinc-500">Weight</label>
          <select
            value={draft.fontWeight}
            onChange={(e) =>
              onDraftChange({ ...draft, fontWeight: e.target.value })
            }
            className="h-8 w-full rounded-md border border-zinc-800 bg-input-bg px-2 text-xs text-zinc-200 outline-none focus:border-emerald-600/50"
          >
            {WEIGHTS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
          <div className="flex gap-1">
            {(["normal", "italic"] as const).map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => onDraftChange({ ...draft, fontStyle: style })}
                className={cn(
                  "flex-1 rounded-md border py-1.5 text-xs capitalize",
                  draft.fontStyle === style
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                    : "border-zinc-800 text-zinc-500 hover:border-zinc-700",
                )}
              >
                {style === "normal" ? "Regular" : "Italic"}
              </button>
            ))}
          </div>
          <label className="block text-[11px] text-zinc-500">Color</label>
          <input
            type="text"
            value={draft.color}
            onChange={(e) => onDraftChange({ ...draft, color: e.target.value })}
            className="h-8 w-full rounded-md border border-zinc-800 bg-input-bg px-2 font-mono text-xs text-zinc-200 outline-none focus:border-emerald-600/50"
          />
        </section>

        <p className="mt-4 text-[10px] leading-relaxed text-zinc-600">
          Live preview updates as you type. <strong className="font-medium text-zinc-500">Apply</strong> saves
          text to project files. Style tweaks preview until you rebuild via chat.
        </p>
      </div>

      <div className="flex items-center gap-2 border-t border-zinc-800 p-3">
        <button
          type="button"
          onClick={onReset}
          title="Reset"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 text-zinc-500 hover:bg-zinc-900"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={applying}
          className="ml-auto flex-1 rounded-md bg-emerald-600 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {applying ? "Saving…" : "Apply"}
        </button>
      </div>
    </aside>
  );
}

export type { Draft as VisualEditDraft };

export function selectionToDraft(s: VisualEditSelection): Draft {
  return {
    text: s.text,
    fontSize: s.fontSize,
    fontWeight: s.fontWeight,
    fontStyle: s.fontStyle === "italic" ? "italic" : "normal",
    color: s.color,
  };
}

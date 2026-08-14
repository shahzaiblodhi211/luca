"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { EnvRequestPart, EnvVarSpec } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  request: EnvRequestPart | null;
  busy?: boolean;
  onClose: () => void;
  onSave: (values: Record<string, string>) => void | Promise<void>;
};

function EyeIcon({ off }: { off?: boolean }) {
  if (off) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A10.5 10.5 0 0121 12c-.5 1-1.2 2-2.1 2.8M6.1 6.1C4.5 7.4 3.3 9.1 2.5 12c1.5 4.5 5.5 7.5 9.5 7.5 1.4 0 2.8-.3 4-.9"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2.5 12C4 7.5 8 4.5 12 4.5S20 7.5 21.5 12C20 16.5 16 19.5 12 19.5S4 16.5 2.5 12z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function Field({
  spec,
  value,
  onChange,
}: {
  spec: EnvVarSpec;
  value: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  const secret = spec.secret !== false;
  return (
    <label className="block space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-foreground">
          {spec.label}
          {spec.required !== false ? (
            <span className="text-destructive"> *</span>
          ) : null}
        </span>
        <code className="text-[11px] text-muted-foreground">{spec.key}</code>
      </div>
      {spec.description ? (
        <p className="text-xs text-muted-foreground">{spec.description}</p>
      ) : null}
      {spec.howToGet ? (
        <p className="rounded-md border border-border/60 bg-muted/40 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground/80">How to get: </span>
          {spec.howToGet}
        </p>
      ) : null}
      <div className="relative">
        <input
          className={cn(
            "h-10 w-full rounded-md border border-input bg-input-bg px-3 text-sm shadow-sm outline-none",
            "placeholder:text-muted-foreground/70 focus-visible:ring-1 focus-visible:ring-ring",
            secret && "pr-10",
          )}
          type={secret && !show ? "password" : "text"}
          autoComplete="off"
          spellCheck={false}
          placeholder={spec.placeholder || `Paste ${spec.key}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {secret ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide value" : "Show value"}
          >
            <EyeIcon off={show} />
          </button>
        ) : null}
      </div>
    </label>
  );
}

export function EnvVarsModal({
  open,
  request,
  busy,
  onClose,
  onSave,
}: Props) {
  const vars = request?.vars ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !request) return;
    const init: Record<string, string> = {};
    for (const v of request.vars) init[v.key] = "";
    setValues(init);
    setError(null);
  }, [open, request]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  const missingRequired = useMemo(
    () =>
      vars.filter(
        (v) => v.required !== false && !String(values[v.key] || "").trim(),
      ),
    [vars, values],
  );

  if (!open || !request) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-3 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="env-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl">
        <header className="border-b border-border px-5 py-4">
          <h2 id="env-modal-title" className="text-base font-semibold tracking-tight">
            {request.title}
          </h2>
          {request.database ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Database: <span className="font-medium text-foreground">{request.database}</span>
            </p>
          ) : null}
          {request.description ? (
            <p className="mt-2 text-sm text-muted-foreground">{request.description}</p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Paste your secrets below. Luca wrote{" "}
              <code className="text-xs">.env.local</code> into the project —
              values stay on this chat&apos;s preview workspace.
            </p>
          )}
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {vars.map((spec) => (
            <Field
              key={spec.key}
              spec={spec}
              value={values[spec.key] ?? ""}
              onChange={(v) =>
                setValues((prev) => ({ ...prev, [spec.key]: v }))
              }
            />
          ))}
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Later
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              if (missingRequired.length) {
                setError(
                  `Fill required: ${missingRequired.map((v) => v.label).join(", ")}`,
                );
                return;
              }
              setError(null);
              void onSave(values);
            }}
          >
            {busy ? "Saving…" : "Save to .env.local"}
          </Button>
        </footer>
      </div>
    </div>
  );
}

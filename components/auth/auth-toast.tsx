"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type AuthToastPayload = {
  id: string;
  type: "success" | "error";
  message: string;
};

type AuthToastContextValue = {
  showToast: (payload: Omit<AuthToastPayload, "id">) => void;
  dismissToast: (id: string) => void;
};

const AuthToastContext = createContext<AuthToastContextValue | null>(null);

const TOAST_TTL_MS = 6000;

export function AuthToastProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [toasts, setToasts] = useState<AuthToastPayload[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => setMounted(true), []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (payload: Omit<AuthToastPayload, "id">) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { ...payload, id }]);
      const timer = setTimeout(() => dismissToast(id), TOAST_TTL_MS);
      timers.current.set(id, timer);
    },
    [dismissToast],
  );

  return (
    <AuthToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      {mounted
        ? createPortal(
            <div
              className="pointer-events-none fixed right-0 top-0 z-[110] flex max-h-dvh flex-col items-end gap-3 overflow-hidden p-4 sm:p-6"
              aria-live="polite"
            >
              {toasts.map((toast) => (
                <AuthToastItem
                  key={toast.id}
                  toast={toast}
                  onDismiss={() => dismissToast(toast.id)}
                />
              ))}
            </div>,
            document.body,
          )
        : null}
    </AuthToastContext.Provider>
  );
}

export function useAuthToast() {
  const ctx = useContext(AuthToastContext);
  if (!ctx) {
    throw new Error("useAuthToast must be used within AuthToastProvider");
  }
  return ctx;
}

function AuthToastItem({
  toast,
  onDismiss,
}: {
  toast: AuthToastPayload;
  onDismiss: () => void;
}) {
  const isSuccess = toast.type === "success";

  return (
    <div
      role={isSuccess ? "status" : "alert"}
      className={cn(
        "pointer-events-auto grid w-full max-w-sm grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-md",
        "animate-in fade-in slide-in-from-right-8 duration-300",
        isSuccess
          ? "border-emerald-500/40 bg-zinc-950/95 shadow-emerald-950/40"
          : "border-red-500/40 bg-zinc-950/95 shadow-red-950/40",
      )}
    >
      {isSuccess ? (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
      ) : (
        <XCircle className="h-5 w-5 shrink-0 text-red-400" aria-hidden />
      )}
      <p
        className={cn(
          "min-w-0 text-[13px] leading-[1.35]",
          isSuccess ? "text-emerald-50" : "text-red-100",
        )}
      >
        {toast.message}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="flex h-7 w-7 shrink-0 items-center justify-center self-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

"use client";

import { Loader2, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuthModal } from "@/components/auth/auth-context";
import { useAuthToast } from "@/components/auth/auth-toast";

const OPEN_EVENT = "luca:connect-vercel";

export function openVercelConnectModal(opts?: { showToken?: boolean }) {
  window.dispatchEvent(
    new CustomEvent(OPEN_EVENT, { detail: opts ?? {} }),
  );
}

export function VercelConnectHost() {
  const [open, setOpen] = useState(false);
  const [forceToken, setForceToken] = useState(false);
  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ showToken?: boolean }>).detail;
      setForceToken(Boolean(detail?.showToken));
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);
  return (
    <VercelConnectModal
      open={open}
      forceToken={forceToken}
      onClose={() => {
        setOpen(false);
        setForceToken(false);
      }}
    />
  );
}

function VercelMark() {
  return (
    <svg viewBox="0 0 76 65" className="h-3.5 w-4" aria-hidden>
      <path d="M37.5 0 75 65H0L37.5 0Z" fill="currentColor" />
    </svg>
  );
}

export function VercelConnectModal({
  open,
  onClose,
  forceToken = false,
}: {
  open: boolean;
  onClose: () => void;
  forceToken?: boolean;
}) {
  const pathname = usePathname();
  const { refreshUser, vercelOAuthConfigured } = useAuthModal();
  const { showToast } = useAuthToast();
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      void refreshUser();
      if (forceToken) setShowToken(true);
    }
  }, [open, forceToken, refreshUser]);

  if (!open) return null;

  async function saveToken() {
    const value = token.trim();
    if (!value) return;
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/vercel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: value }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not connect Vercel.");
      await refreshUser();
      showToast({ type: "success", message: "Vercel connected." });
      setToken("");
      onClose();
    } catch (err) {
      showToast({
        type: "error",
        message: err instanceof Error ? err.message : "Could not connect.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="relative z-10 w-full max-w-[380px] rounded-2xl border border-zinc-800 bg-[#111] p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-zinc-100">
          <VercelMark />
        </div>
        <h2 className="mt-4 text-[17px] font-semibold tracking-tight text-zinc-50">
          Connect Vercel
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">
          Publish this site to your Vercel account.
        </p>

        {vercelOAuthConfigured ? (
          <a
            href={`/api/integrations/vercel/connect?return=${encodeURIComponent(pathname || "/")}`}
            className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white text-[13px] font-medium text-zinc-950 transition-colors hover:bg-zinc-100"
          >
            <VercelMark />
            Continue with Vercel
          </a>
        ) : (
          <button
            type="button"
            onClick={() => {
              setShowToken(true);
              window.open("https://vercel.com/account/tokens", "_blank", "noopener,noreferrer");
            }}
            className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white text-[13px] font-medium text-zinc-950 transition-colors hover:bg-zinc-100"
          >
            <VercelMark />
            Continue with Vercel
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowToken((v) => !v)}
          className="mt-3 w-full text-center text-[12px] text-zinc-500 transition-colors hover:text-zinc-300"
        >
          {showToken ? "Hide token" : "Use an access token"}
        </button>

        {showToken ? (
          <div className="mt-3 space-y-2.5">
            <p className="text-[12px] leading-relaxed text-zinc-500">
              Create a <span className="text-zinc-300">Full Account</span> token
              on Vercel, then paste it here.
            </p>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Access token"
              className="h-10 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-600"
            />
            <button
              type="button"
              disabled={busy || !token.trim()}
              onClick={() => void saveToken()}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-[13px] font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Connect
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

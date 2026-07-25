"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useTransition } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { LucaMark } from "@/components/brand/logo";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNote(null);
    if (!token) {
      setError("This reset link is missing a token.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password }),
        });
        const data = (await res.json()) as {
          error?: string;
          message?: string;
        };
        if (!res.ok) {
          setError(data.error || "Could not reset password.");
          return;
        }
        setNote(data.message || "Password updated.");
        window.setTimeout(() => router.push("/?auth=login"), 900);
      } catch {
        setError("Network error. Try again.");
      }
    });
  }

  return (
    <div className="relative min-h-dvh bg-black text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(52,211,153,0.12),_transparent_55%)]"
      />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[400px] flex-col justify-center px-4 py-16">
        <div className="rounded-2xl border border-zinc-800 bg-black px-6 py-8 sm:px-8">
          <div className="mb-6 space-y-2 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center">
              <LucaMark size="lg" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">
              Set a new password
            </h1>
            <p className="text-sm text-zinc-400">
              Choose a strong password for your Luca account.
            </p>
          </div>

          {!token ? (
            <p className="text-center text-sm text-red-400">
              Invalid reset link.{" "}
              <Link href="/?auth=forgot" className="text-sky-400 underline">
                Request a new one
              </Link>
              .
            </p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="relative">
                <Input
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 rounded-xl border-zinc-700 bg-zinc-950 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-zinc-500 hover:text-white"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <Input
                type={show ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Confirm password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="h-11 rounded-xl border-zinc-700 bg-zinc-950"
              />
              <button
                type="submit"
                disabled={pending}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-60"
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Update password
              </button>
            </form>
          )}

          {(error || note) && (
            <p
              className={cn(
                "mt-4 text-center text-[13px]",
                error ? "text-red-400" : "text-emerald-400",
              )}
            >
              {error || note}
            </p>
          )}

          <p className="mt-6 text-center text-sm text-zinc-500">
            <Link href="/?auth=login" className="text-sky-400 hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-black text-zinc-400">
          Loading…
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}

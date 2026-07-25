"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Eye, EyeOff, Loader2, X } from "lucide-react";
import { LucaMark } from "@/components/brand/logo";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PublicUser } from "@/lib/auth/types";
import { useAuthModal, type AuthMode } from "./auth-context";
import { AppleIcon, GitHubIcon, GoogleIcon } from "./social-icons";

const SOCIAL = [
  { id: "google", label: "Continue with Google", Icon: GoogleIcon },
  { id: "github", label: "Continue with GitHub", Icon: GitHubIcon },
  { id: "apple", label: "Continue with Apple", Icon: AppleIcon },
] as const;

const btnPrimary =
  "flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-black transition-colors duration-150 hover:bg-zinc-200 active:bg-zinc-300 disabled:pointer-events-none disabled:opacity-60";

const btnSocial =
  "flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-zinc-700 bg-transparent text-sm font-medium text-white transition-colors duration-150 hover:border-zinc-500 hover:bg-zinc-900 active:bg-zinc-800";

const inputAuth =
  "h-11 rounded-xl border-zinc-700 bg-zinc-950 transition-colors duration-150 placeholder:text-zinc-500 hover:border-zinc-500 focus-visible:border-zinc-400 focus-visible:ring-1 focus-visible:ring-zinc-500";

export function AuthModal() {
  const { open, mode, closeAuth, setMode, setUser, refreshUser } = useAuthModal();
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAuth();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, closeAuth]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px] animate-in fade-in duration-200"
        onClick={closeAuth}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative z-10 w-full max-w-[400px] rounded-2xl border border-zinc-800 bg-black",
          "px-6 pb-7 pt-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200 sm:px-8 sm:pt-8",
        )}
      >
        <button
          type="button"
          onClick={closeAuth}
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors duration-150 hover:bg-zinc-800 hover:text-white active:bg-zinc-700"
          aria-label="Close dialog"
        >
          <X className="h-4 w-4" />
        </button>

        <AuthModalBody
          mode={mode}
          titleId={titleId}
          onSwitch={(next) => setMode(next)}
          onDone={closeAuth}
          onAuthed={(user) => {
            setUser(user);
            void refreshUser();
            closeAuth();
          }}
        />
      </div>
    </div>,
    document.body,
  );
}

function AuthModalBody({
  mode,
  titleId,
  onSwitch,
  onDone,
  onAuthed,
}: {
  mode: AuthMode;
  titleId: string;
  onSwitch: (mode: AuthMode) => void;
  onDone: () => void;
  onAuthed: (user: PublicUser) => void;
}) {
  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";
  const [step, setStep] = useState<"main" | "password">("main");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setStep("main");
    setPassword("");
    setName("");
    setError(null);
    setNote(null);
    setDevResetUrl(null);
    setShowPassword(false);
  }, [mode]);

  function onSocial(provider: string) {
    setError(null);
    setNote(
      `${provider[0]!.toUpperCase()}${provider.slice(1)} sign-in will plug in next — use email for now.`,
    );
  }

  function onEmailContinue(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNote(null);
    const next = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
      setError("Enter a valid work or school email.");
      return;
    }
    setEmail(next);
    setStep("password");
  }

  function onForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNote(null);
    setDevResetUrl(null);
    const next = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
      setError("Enter a valid email.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: next }),
        });
        const data = (await res.json()) as {
          error?: string;
          message?: string;
          resetUrl?: string;
        };
        if (!res.ok) {
          setError(data.error || "Could not send reset link.");
          return;
        }
        setNote(
          data.message ||
            "If an account exists for that email, we sent a reset link.",
        );
        if (data.resetUrl) setDevResetUrl(data.resetUrl);
      } catch {
        setError("Network error. Try again.");
      }
    });
  }

  function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNote(null);
    if (isSignup && name.trim().length < 2) {
      setError("Add your name (at least 2 characters).");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    startTransition(async () => {
      try {
        const endpoint = isSignup ? "/api/auth/signup" : "/api/auth/login";
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isSignup
              ? { email, password, name: name.trim() }
              : { email, password },
          ),
        });
        const data = (await res.json()) as {
          error?: string;
          user?: PublicUser;
        };
        if (!res.ok || !data.user) {
          setError(data.error || "Something went wrong.");
          return;
        }
        onAuthed(data.user);
      } catch {
        setError("Network error. Try again.");
      }
    });
  }

  const title = isForgot
    ? "Forgot password"
    : isSignup
      ? "Sign up for luca"
      : "Sign in to luca";

  const subtitle = isForgot
    ? "Enter your email and we'll send a reset link"
    : step === "main"
      ? "We suggest using the email address you use at work or school"
      : isSignup
        ? "Add your name and a password to finish"
        : "Enter your password to continue";

  return (
    <div className="space-y-6">
      <div className="space-y-3 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center">
          <LucaMark size="lg" />
        </div>
        <div className="space-y-2">
          <h2
            id={titleId}
            className="text-[1.5rem] font-semibold tracking-tight text-white sm:text-[1.65rem]"
          >
            {title}
          </h2>
          <p className="text-[14px] leading-relaxed text-zinc-400">{subtitle}</p>
        </div>
      </div>

      {isForgot ? (
        <form onSubmit={onForgotSubmit} className="space-y-3">
          <Input
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="name@work-email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={inputAuth}
          />
          <button type="submit" disabled={pending} className={btnPrimary}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Send reset link
          </button>
          <button
            type="button"
            onClick={() => onSwitch("login")}
            className="inline-flex w-full items-center justify-center gap-1.5 text-[13px] text-zinc-500 transition-colors duration-150 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </button>
        </form>
      ) : step === "main" ? (
        <div className="space-y-3">
          <form onSubmit={onEmailContinue} className="space-y-3">
            <Input
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="name@work-email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={inputAuth}
            />
            <button type="submit" className={btnPrimary}>
              Continue with Email
            </button>
          </form>

          <div className="py-1">
            <div className="h-px w-full bg-zinc-800" />
          </div>

          {SOCIAL.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onSocial(id)}
              className={btnSocial}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {label}
            </button>
          ))}
        </div>
      ) : (
        <form onSubmit={onPasswordSubmit} className="space-y-3">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setNote(null);
              setPassword("");
              setStep("main");
            }}
            className="inline-flex items-center gap-1.5 text-[13px] text-zinc-500 transition-colors duration-150 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {email}
          </button>

          {isSignup && (
            <Input
              type="text"
              autoComplete="name"
              autoFocus
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={inputAuth}
            />
          )}

          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              autoComplete={isSignup ? "new-password" : "current-password"}
              autoFocus={!isSignup}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={cn(inputAuth, "pr-11")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-zinc-500 transition-colors duration-150 hover:text-white"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>

          {!isSignup && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => onSwitch("forgot")}
                className="text-[13px] text-zinc-500 transition-colors duration-150 hover:text-sky-400"
              >
                Forgot password?
              </button>
            </div>
          )}

          <button type="submit" disabled={pending} className={btnPrimary}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSignup ? "Create account" : "Sign in"}
          </button>
        </form>
      )}

      {(error || note) && (
        <div className="space-y-2">
          <p
            className={cn(
              "text-center text-[13px]",
              error ? "text-red-400" : "text-emerald-400/90",
            )}
            role={error ? "alert" : "status"}
          >
            {error || note}
          </p>
          {devResetUrl && (
            <a
              href={devResetUrl}
              className="block break-all text-center text-[12px] text-sky-400 underline underline-offset-2 hover:text-sky-300"
              onClick={onDone}
            >
              Open reset link (dev)
            </a>
          )}
        </div>
      )}

      {!isForgot && (
        <p className="text-center text-[14px] text-zinc-400">
          {isSignup ? (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => onSwitch("login")}
                className="font-medium text-sky-400 underline-offset-2 transition-colors duration-150 hover:text-sky-300 hover:underline"
              >
                Sign In
              </button>
            </>
          ) : (
            <>
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => onSwitch("signup")}
                className="font-medium text-sky-400 underline-offset-2 transition-colors duration-150 hover:text-sky-300 hover:underline"
              >
                Sign up
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}

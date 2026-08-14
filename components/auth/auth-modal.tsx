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

import {

  authBtnPrimary,

  authBtnSocial,

  authInput,

  authLink,

  authLinkSubtle,

} from "./auth-styles";

import { useAuthToast } from "./auth-toast";



const SOCIAL = [

  { id: "google", label: "Continue with Google", Icon: GoogleIcon },

  { id: "github", label: "Continue with GitHub", Icon: GitHubIcon },

  { id: "apple", label: "Continue with Apple", Icon: AppleIcon },

] as const;



type ForgotStep = "email" | "code" | "newPassword";



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

          "relative z-10 w-full max-w-[400px] overflow-visible rounded-2xl border border-zinc-800 bg-black",

          "px-6 pb-7 pt-6 shadow-2xl shadow-emerald-950/20 animate-in fade-in zoom-in-95 duration-200 sm:px-8 sm:pt-8",

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

  onAuthed,

}: {

  mode: AuthMode;

  titleId: string;

  onSwitch: (mode: AuthMode) => void;

  onAuthed: (user: PublicUser) => void;

}) {

  const { showToast } = useAuthToast();

  const isSignup = mode === "signup";

  const isForgot = mode === "forgot";

  const [step, setStep] = useState<"main" | "password">("main");

  const [forgotStep, setForgotStep] = useState<ForgotStep>("email");

  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [name, setName] = useState("");

  const [showPassword, setShowPassword] = useState(false);

  const [resetCode, setResetCode] = useState("");

  const [newPassword, setNewPassword] = useState("");

  const [confirmPassword, setConfirmPassword] = useState("");

  const [pendingAuth, startAuthTransition] = useTransition();

  const [sendingLink, setSendingLink] = useState(false);

  const [verifyingCode, setVerifyingCode] = useState(false);

  const [resettingPassword, setResettingPassword] = useState(false);

  const [socialLoading, setSocialLoading] = useState<
    "google" | "github" | "apple" | null
  >(null);



  useEffect(() => {

    setStep("main");

    setForgotStep("email");

    setPassword("");

    setName("");

    setResetCode("");

    setNewPassword("");

    setConfirmPassword("");

    setShowPassword(false);

  }, [mode]);



  function onSocial(provider: "google" | "github" | "apple") {
    setSocialLoading(provider);
    const authMode = isSignup ? "signup" : "login";
    window.location.href = `/api/auth/oauth/${provider}?mode=${authMode}`;
  }



  function sendResetLink() {

    const next = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {

      showToast({ type: "error", message: "Enter a valid email." });

      return;

    }

    setEmail(next);



    setSendingLink(true);

    void (async () => {

      try {

        const res = await fetch("/api/auth/forgot-password", {

          method: "POST",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({ email: next }),

        });

        const data = (await res.json()) as { error?: string; message?: string };

        if (!res.ok) {

          showToast({

            type: "error",

            message: data.error || "Could not send reset email.",

          });

          return;

        }

        showToast({

          type: "success",

          message:

            data.message ||

            "If an account exists for that email, we sent a reset link and 6-digit code.",

        });

        setForgotStep("code");

        setResetCode("");

      } catch {

        showToast({ type: "error", message: "Network error. Try again." });

      } finally {

        setSendingLink(false);

      }

    })();

  }



  function onVerifyCode(e: React.FormEvent) {

    e.preventDefault();

    const nextEmail = email.trim().toLowerCase();

    const code = resetCode.replace(/\D/g, "");

    if (code.length !== 6) {

      showToast({ type: "error", message: "Enter the 6-digit code from your email." });

      return;

    }



    setVerifyingCode(true);

    void (async () => {

      try {

        const res = await fetch("/api/auth/verify-reset-code", {

          method: "POST",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({ email: nextEmail, code }),

        });

        const data = (await res.json()) as { error?: string; message?: string };

        if (!res.ok) {

          showToast({

            type: "error",

            message: data.error || "Invalid or expired code.",

          });

          return;

        }

        showToast({

          type: "success",

          message: data.message || "Code verified. Choose a new password.",

        });

        setForgotStep("newPassword");

      } catch {

        showToast({ type: "error", message: "Network error. Try again." });

      } finally {

        setVerifyingCode(false);

      }

    })();

  }



  function onResetPasswordSubmit(e: React.FormEvent) {

    e.preventDefault();

    const nextEmail = email.trim().toLowerCase();

    const code = resetCode.replace(/\D/g, "");

    if (newPassword.length < 8) {

      showToast({ type: "error", message: "Password must be at least 8 characters." });

      return;

    }

    if (newPassword !== confirmPassword) {

      showToast({ type: "error", message: "Passwords do not match." });

      return;

    }



    setResettingPassword(true);

    void (async () => {

      try {

        const res = await fetch("/api/auth/reset-password", {

          method: "POST",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({

            email: nextEmail,

            code,

            password: newPassword,

          }),

        });

        const data = (await res.json()) as { error?: string; message?: string };

        if (!res.ok) {

          showToast({

            type: "error",

            message: data.error || "Could not reset password.",

          });

          return;

        }

        showToast({

          type: "success",

          message: data.message || "Password updated. Sign in with your new password.",

        });

        window.setTimeout(() => onSwitch("login"), 1200);

      } catch {

        showToast({ type: "error", message: "Network error. Try again." });

      } finally {

        setResettingPassword(false);

      }

    })();

  }



  function onEmailContinue(e: React.FormEvent) {

    e.preventDefault();

    const next = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {

      showToast({ type: "error", message: "Enter a valid work or school email." });

      return;

    }

    setEmail(next);

    setStep("password");

  }



  function onPasswordSubmit(e: React.FormEvent) {

    e.preventDefault();

    if (isSignup && name.trim().length < 2) {

      showToast({ type: "error", message: "Add your name (at least 2 characters)." });

      return;

    }

    if (password.length < 8) {

      showToast({ type: "error", message: "Password must be at least 8 characters." });

      return;

    }



    startAuthTransition(async () => {

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

          showToast({

            type: "error",

            message: data.error || "Something went wrong.",

          });

          return;

        }

        onAuthed(data.user);

      } catch {

        showToast({ type: "error", message: "Network error. Try again." });

      }

    });

  }



  const forgotBusy = sendingLink || verifyingCode || resettingPassword;



  const title = isForgot

    ? forgotStep === "email"

      ? "Forgot password"

      : forgotStep === "code"

        ? "Enter reset code"

        : "Choose new password"

    : isSignup

      ? "Sign up for luca"

      : "Sign in to luca";



  const subtitle = isForgot

    ? forgotStep === "email"

      ? "Enter your email and we'll send a reset link and 6-digit code"

      : forgotStep === "code"

        ? `Enter the 6-digit code we sent to ${email}`

        : "Set a new password for your account"

    : step === "main"

      ? "We suggest using the email address you use at work or school"

      : isSignup

        ? "Add your name and a password to finish"

        : "Enter your password to continue";



  return (

    <div className="relative space-y-6">

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

        forgotStep === "email" ? (

          <div className="space-y-3">

            <Input

              type="email"

              autoComplete="email"

              autoFocus

              placeholder="name@work-email.com"

              value={email}

              onChange={(e) => setEmail(e.target.value)}

              required

              disabled={sendingLink}

              className={authInput}

            />

            <button

              type="button"

              disabled={sendingLink}

              onClick={sendResetLink}

              className={authBtnPrimary}

            >

              {sendingLink ? (

                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />

              ) : null}

              Send reset link

            </button>

            <button

              type="button"

              disabled={sendingLink}

              onClick={() => onSwitch("login")}

              className="inline-flex w-full items-center justify-center gap-1.5 text-[13px] text-zinc-500 transition-colors duration-150 hover:text-white disabled:opacity-60"

            >

              <ArrowLeft className="h-3.5 w-3.5" />

              Back to sign in

            </button>

          </div>

        ) : forgotStep === "code" ? (

          <div className="space-y-3">

            <form onSubmit={onVerifyCode} className="space-y-3">

              <Input

                type="text"

                inputMode="numeric"

                autoComplete="one-time-code"

                autoFocus

                placeholder="6-digit code"

                value={resetCode}

                onChange={(e) =>

                  setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))

                }

                disabled={forgotBusy}

                className={cn(authInput, "font-mono tracking-[0.35em] text-center")}

              />

              <button

                type="submit"

                disabled={forgotBusy}

                className={authBtnPrimary}

              >

                {verifyingCode ? (

                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />

                ) : null}

                Verify code

              </button>

            </form>

            <button

              type="button"

              disabled={forgotBusy}

              onClick={sendResetLink}

              className={cn(authBtnSocial, "border-dashed text-zinc-400")}

            >

              {sendingLink ? (

                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />

              ) : null}

              Resend reset email

            </button>

            <button

              type="button"

              disabled={forgotBusy}

              onClick={() => {

                setForgotStep("email");

                setResetCode("");

              }}

              className="inline-flex w-full items-center justify-center gap-1.5 text-[13px] text-zinc-500 transition-colors duration-150 hover:text-white disabled:opacity-60"

            >

              <ArrowLeft className="h-3.5 w-3.5" />

              Change email

            </button>

          </div>

        ) : (

          <form onSubmit={onResetPasswordSubmit} className="space-y-3">

            <div className="relative">

              <Input

                type={showPassword ? "text" : "password"}

                autoComplete="new-password"

                autoFocus

                placeholder="New password"

                value={newPassword}

                onChange={(e) => setNewPassword(e.target.value)}

                disabled={resettingPassword}

                className={cn(authInput, "pr-11")}

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

            <Input

              type={showPassword ? "text" : "password"}

              autoComplete="new-password"

              placeholder="Confirm password"

              value={confirmPassword}

              onChange={(e) => setConfirmPassword(e.target.value)}

              disabled={resettingPassword}

              className={authInput}

            />

            <button

              type="submit"

              disabled={resettingPassword}

              className={authBtnPrimary}

            >

              {resettingPassword ? (

                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />

              ) : null}

              Reset password

            </button>

            <button

              type="button"

              disabled={resettingPassword}

              onClick={() => setForgotStep("code")}

              className="inline-flex w-full items-center justify-center gap-1.5 text-[13px] text-zinc-500 transition-colors duration-150 hover:text-white disabled:opacity-60"

            >

              <ArrowLeft className="h-3.5 w-3.5" />

              Back to code

            </button>

          </form>

        )

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

              className={authInput}

            />

            <button type="submit" className={authBtnPrimary}>

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

              disabled={socialLoading !== null}

              onClick={() => onSocial(id)}

              className={authBtnSocial}

            >

              {socialLoading === id ? (

                <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin" aria-hidden />

              ) : (

                <Icon className="h-[18px] w-[18px] shrink-0" />

              )}

              {label}

            </button>

          ))}

        </div>

      ) : (

        <form onSubmit={onPasswordSubmit} className="space-y-3">

          <button

            type="button"

            onClick={() => {

              setPassword("");

              setStep("main");

            }}

            disabled={pendingAuth}

            className="inline-flex items-center gap-1.5 text-[13px] text-zinc-500 transition-colors duration-150 hover:text-white disabled:opacity-60"

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

              disabled={pendingAuth}

              className={authInput}

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

              disabled={pendingAuth}

              className={cn(authInput, "pr-11")}

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

                disabled={pendingAuth}

                className={cn(authLinkSubtle, "disabled:opacity-60")}

              >

                Forgot password?

              </button>

            </div>

          )}



          <button type="submit" disabled={pendingAuth} className={authBtnPrimary}>

            {pendingAuth ? (

              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />

            ) : null}

            {isSignup ? "Create account" : "Sign in"}

          </button>

        </form>

      )}



      {!isForgot && (

        <p className="text-center text-[14px] text-zinc-400">

          {isSignup ? (

            <>

              Already have an account?{" "}

              <button

                type="button"

                onClick={() => onSwitch("login")}

                disabled={pendingAuth}

                className={cn(authLink, "disabled:opacity-60")}

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

                disabled={pendingAuth}

                className={cn(authLink, "disabled:opacity-60")}

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


"use client";



import Link from "next/link";

import { useRouter, useSearchParams } from "next/navigation";

import { Suspense, useEffect, useState } from "react";

import { Eye, EyeOff, Loader2 } from "lucide-react";

import { LucaMark } from "@/components/brand/logo";

import { Input } from "@/components/ui/input";

import { cn } from "@/lib/utils";

import { AuthToastProvider, useAuthToast } from "@/components/auth/auth-toast";

import {

  authInput,

  authLink,

  authSubmitBtn,

} from "@/components/auth/auth-styles";



function ResetPasswordForm() {

  const router = useRouter();

  const params = useSearchParams();

  const token = params.get("token") || "";

  const { showToast } = useAuthToast();

  const [password, setPassword] = useState("");

  const [confirm, setConfirm] = useState("");

  const [show, setShow] = useState(false);

  const [pending, setPending] = useState(false);



  useEffect(() => {

    if (!token) {

      router.replace("/?auth=forgot");

    }

  }, [token, router]);



  function onSubmit(e: React.FormEvent) {

    e.preventDefault();

    if (!token) {

      showToast({ type: "error", message: "This reset link is missing a token." });

      return;

    }

    if (password.length < 8) {

      showToast({ type: "error", message: "Password must be at least 8 characters." });

      return;

    }

    if (password !== confirm) {

      showToast({ type: "error", message: "Passwords do not match." });

      return;

    }



    setPending(true);

    void (async () => {

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

          showToast({

            type: "error",

            message: data.error || "Could not reset password.",

          });

          return;

        }

        showToast({

          type: "success",

          message: data.message || "Password updated.",

        });

        window.setTimeout(() => router.push("/?auth=login"), 900);

      } catch {

        showToast({ type: "error", message: "Network error. Try again." });

      } finally {

        setPending(false);

      }

    })();

  }



  if (!token) {

    return (

      <div className="flex min-h-dvh items-center justify-center bg-black text-zinc-400">

        <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />

      </div>

    );

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

              Choose a new password for your account.

            </p>

          </div>



          <form onSubmit={onSubmit} className="space-y-3">

            <div className="relative">

              <Input

                type={show ? "text" : "password"}

                autoComplete="new-password"

                autoFocus

                placeholder="New password"

                value={password}

                onChange={(e) => setPassword(e.target.value)}

                required

                disabled={pending}

                className={cn(authInput, "pr-11")}

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

              disabled={pending}

              className={authInput}

            />

            <button type="submit" disabled={pending} className={authSubmitBtn}>

              {pending ? (

                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />

              ) : null}

              Update password

            </button>

          </form>



          <p className="mt-6 text-center text-sm text-zinc-500">

            <Link href="/?auth=forgot" className={authLink}>

              Request a new code

            </Link>

            {" · "}

            <Link href="/?auth=login" className={authLink}>

              Sign in

            </Link>

          </p>

        </div>

      </div>

    </div>

  );

}



export default function ResetPasswordPage() {

  return (

    <AuthToastProvider>

      <Suspense

        fallback={

          <div className="flex min-h-dvh items-center justify-center bg-black text-zinc-400">

            <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />

          </div>

        }

      >

        <ResetPasswordForm />

      </Suspense>

    </AuthToastProvider>

  );

}


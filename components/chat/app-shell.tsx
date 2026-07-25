"use client";



import { Suspense } from "react";

import { AuthModal } from "@/components/auth/auth-modal";

import { AuthProvider } from "@/components/auth/auth-context";

import { AuthQueryOpener } from "@/components/auth/auth-query-opener";

import { PlansProvider } from "@/components/billing/plans-modal";

import { PlansQueryOpener } from "@/components/billing/plans-query-opener";

import { Sidebar } from "./sidebar";

import { ShellProvider } from "./shell-context";

import type { ChatSummary } from "@/lib/types";



export function AppShell({

  children,

  initialChats,

}: {

  children: React.ReactNode;

  initialChats?: ChatSummary[];

}) {

  return (

    <ShellProvider>

      <AuthProvider>

        <PlansProvider>

          <div className="flex h-dvh overflow-hidden bg-zinc-950 text-zinc-100">

            <Sidebar initialChats={initialChats} />

            <main className="flex min-w-0 flex-1 flex-col">{children}</main>

          </div>

          <Suspense fallback={null}>

            <AuthQueryOpener />

            <PlansQueryOpener />

          </Suspense>

          <AuthModal />

        </PlansProvider>

      </AuthProvider>

    </ShellProvider>

  );

}


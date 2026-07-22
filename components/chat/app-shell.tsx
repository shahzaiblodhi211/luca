"use client";

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
      <div className="flex h-dvh overflow-hidden bg-zinc-950 text-zinc-100">
        <Sidebar initialChats={initialChats} />
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </ShellProvider>
  );
}

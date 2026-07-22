"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MessageSquarePlus, Trash2, PanelLeftClose, PanelLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { ChatSummary } from "@/lib/types";
import { useShell } from "./shell-context";

export function Sidebar({
  initialChats,
}: {
  initialChats?: ChatSummary[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarOpen, toggleSidebar, previewOpen } = useShell();
  const [chats, setChats] = useState<ChatSummary[]>(initialChats ?? []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/chats");
        if (!res.ok) return;
        const data = (await res.json()) as { chats: ChatSummary[] };
        if (!cancelled) setChats(data.chats);
      } catch {
        /* ignore */
      }
    }
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [pathname]);

  async function removeChat(id: string) {
    await fetch(`/api/chats/${id}`, { method: "DELETE" });
    setChats((prev) => prev.filter((c) => c.id !== id));
    if (pathname === `/c/${id}`) router.push("/");
  }

  return (
    <>
      <button
        type="button"
        onClick={toggleSidebar}
        className={cn(
          "fixed z-40 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-300 shadow-lg transition hover:bg-zinc-900",
          sidebarOpen ? "left-[17rem] top-3" : "left-3 top-3",
        )}
        aria-label={sidebarOpen ? "Collapse sidebar" : "Open sidebar"}
        title={sidebarOpen ? "Collapse sidebar" : "Open sidebar"}
      >
        {sidebarOpen ? (
          <PanelLeftClose className="h-4 w-4" />
        ) : (
          <PanelLeft className="h-4 w-4" />
        )}
      </button>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 transition-all duration-200",
          sidebarOpen
            ? "translate-x-0"
            : "pointer-events-none -translate-x-full",
          "lg:static lg:transition-[width,transform,opacity]",
          sidebarOpen
            ? "lg:w-64 lg:translate-x-0 lg:opacity-100"
            : "lg:w-0 lg:translate-x-0 lg:border-0 lg:opacity-0",
        )}
      >
        <div
          className={cn(
            "flex h-full w-64 flex-col",
            !sidebarOpen && "invisible lg:invisible",
          )}
        >
          <div className="flex items-center gap-2 px-4 py-4 pr-12">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-sm font-bold text-zinc-900">
              L
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-100">Luca AI</p>
              <p className="text-[11px] text-zinc-500">
                {previewOpen ? "Preview mode" : "by Luca Technology"}
              </p>
            </div>
          </div>

          <div className="px-3 pb-3">
            <Link
              href="/"
              className="flex w-full items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-800"
            >
              <MessageSquarePlus className="h-4 w-4" />
              New chat
            </Link>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
            <p className="px-2 pb-2 text-[11px] uppercase tracking-wider text-zinc-600">
              Recent
            </p>
            <ul className="space-y-0.5">
              {chats.map((chat) => {
                const active = pathname === `/c/${chat.id}`;
                return (
                  <li key={chat.id} className="group relative">
                    <Link
                      href={`/c/${chat.id}`}
                      className={cn(
                        "block truncate rounded-lg px-3 py-2 pr-9 text-sm",
                        active
                          ? "bg-zinc-800 text-zinc-50"
                          : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200",
                      )}
                    >
                      {chat.title}
                    </Link>
                    <button
                      type="button"
                      onClick={() => void removeChat(chat.id)}
                      className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200 group-hover:block"
                      aria-label="Delete chat"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
              {!chats.length && (
                <li className="px-3 py-2 text-xs text-zinc-600">No chats yet</li>
              )}
            </ul>
          </div>
        </div>
      </aside>
    </>
  );
}

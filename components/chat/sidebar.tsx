"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Home,
  LayoutGrid,
  LogOut,
  MessageSquarePlus,
  MessagesSquare,
  PanelLeft,
  PanelLeftClose,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useAuthModal } from "@/components/auth/auth-context";
import { usePlansModal } from "@/components/billing/plans-modal";
import { LucaMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import type { ChatSummary } from "@/lib/types";
import { useShell } from "./shell-context";

const SIDEBAR_W = "w-[260px]";

function userInitials(name?: string | null, email?: string | null) {
  const src = (name || email || "L").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  }
  return src.slice(0, 2).toUpperCase();
}

export function Sidebar({
  initialChats,
}: {
  initialChats?: ChatSummary[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { openAuth, user, billing, loading: authLoading, logout } =
    useAuthModal();
  const { openPlans } = usePlansModal();
  const { sidebarOpen, toggleSidebar } = useShell();
  const [chats, setChats] = useState<ChatSummary[]>(initialChats ?? []);
  const [recentOpen, setRecentOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChatSummary | null>(null);
  const [deleting, startDelete] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  const isHome = pathname === "/";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user) {
        if (!cancelled) setChats([]);
        return;
      }
      try {
        const res = await fetch("/api/chats");
        if (!res.ok) {
          if (!cancelled) setChats([]);
          return;
        }
        const data = (await res.json()) as { chats: ChatSummary[] };
        if (!cancelled) setChats(data.chats);
      } catch {
        if (!cancelled) setChats([]);
      }
    }
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [pathname, user?.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!sidebarOpen) return;
        setSearchOpen(true);
        setRecentOpen(true);
        window.setTimeout(() => searchRef.current?.focus(), 0);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  useEffect(() => {
    if (!accountOpen) return;
    function onDoc(e: MouseEvent) {
      if (!accountRef.current?.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [accountOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) => c.title.toLowerCase().includes(q));
  }, [chats, query]);

  useEffect(() => {
    if (!deleteTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !deleting) setDeleteTarget(null);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [deleteTarget, deleting]);

  function confirmDeleteChat() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    startDelete(async () => {
      await fetch(`/api/chats/${id}`, { method: "DELETE" });
      setChats((prev) => prev.filter((c) => c.id !== id));
      setDeleteTarget(null);
      if (pathname === `/c/${id}`) router.push("/");
    });
  }

  const workspaceLabel = user
    ? `${user.name.split(" ")[0]}'s Luca`
    : "Personal";

  const planLabel = billing?.planName ?? "Free";
  const creditsHint =
    billing && !billing.billingExempt
      ? `${billing.creditsRemaining.toLocaleString()} credits left`
      : billing?.billingExempt
        ? "Unlimited usage"
        : "Free plan";

  return (
    <>
      {!sidebarOpen && (
        <button
          type="button"
          onClick={toggleSidebar}
          className="fixed left-3 top-3 z-40 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-300 shadow-lg transition-colors hover:bg-zinc-900 hover:text-white"
          aria-label="Open sidebar"
          title="Open sidebar"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/35 transition-all duration-200",
          SIDEBAR_W,
          sidebarOpen
            ? "translate-x-0"
            : "pointer-events-none -translate-x-full",
          "lg:static lg:transition-[width,transform,opacity]",
          sidebarOpen
            ? "lg:w-[260px] lg:translate-x-0 lg:opacity-100"
            : "lg:w-0 lg:translate-x-0 lg:opacity-0",
        )}
      >
        <div
          className={cn(
            "flex h-full w-[260px] flex-col px-3 pb-3 pt-3",
            !sidebarOpen && "invisible lg:invisible",
          )}
        >
          {/* Header: mark + collapse */}
          <div className="mb-3 flex items-center justify-between px-1">
            <Link
              href="/"
              className="flex items-center gap-2.5 rounded-lg py-0.5 transition-opacity hover:opacity-90"
            >
              <LucaMark size="xs" />
              <span className="text-[15px] font-semibold tracking-tight text-zinc-50">
                Luca
              </span>
            </Link>
            <button
              type="button"
              onClick={toggleSidebar}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-200"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>

          {/* Workspace / account selector */}
          <div className="relative mb-2" ref={accountRef}>
            <button
              type="button"
              onClick={() => setAccountOpen((v) => !v)}
              className="flex w-full items-center gap-2.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-2.5 py-2 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-900"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-500/25">
                {userInitials(user?.name, user?.email)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-zinc-100">
                  {workspaceLabel}
                </p>
                {user ? (
                  <p className="truncate text-[11px] text-zinc-500">
                    {creditsHint}
                  </p>
                ) : (
                  <p className="truncate text-[11px] text-zinc-500">
                    Sign in to sync chats
                  </p>
                )}
              </div>
              {user && (
                <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                  {planLabel}
                </span>
              )}
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform",
                  accountOpen && "rotate-180",
                )}
              />
            </button>

            {accountOpen && (
              <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 py-1 shadow-2xl">
                {user ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setAccountOpen(false);
                        openPlans();
                      }}
                      className="flex w-full px-3 py-2 text-left text-[13px] text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
                    >
                      Change plan
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAccountOpen(false);
                        void logout().then(() => {
                          setChats([]);
                          router.push("/");
                        });
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign out
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setAccountOpen(false);
                        openAuth("login");
                      }}
                      className="flex w-full px-3 py-2 text-left text-[13px] text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
                    >
                      Sign in
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAccountOpen(false);
                        openAuth("signup");
                      }}
                      className="flex w-full px-3 py-2 text-left text-[13px] text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
                    >
                      Create free account
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* New Chat */}
          <Link
            href="/"
            className="mb-3 flex h-10 items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 text-[13px] font-medium text-zinc-100 transition-colors hover:border-zinc-600 hover:bg-zinc-800"
          >
            <span className="inline-flex items-center gap-2">
              <MessageSquarePlus className="h-4 w-4 text-zinc-300" />
              New Chat
            </span>
          </Link>

          {/* Primary nav */}
          <nav className="mb-3 space-y-0.5">
            <button
              type="button"
              onClick={() => {
                setSearchOpen((v) => !v);
                setRecentOpen(true);
                window.setTimeout(() => searchRef.current?.focus(), 0);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
                searchOpen
                  ? "bg-zinc-800/80 text-zinc-50"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
              )}
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">Search</span>
              <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                Ctrl K
              </kbd>
            </button>

            <Link
              href="/"
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
                isHome && !pathname.startsWith("/c/")
                  ? "bg-zinc-800/80 text-zinc-50"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
              )}
            >
              <Home className="h-4 w-4 shrink-0" />
              Home
            </Link>

            <button
              type="button"
              onClick={() => {
                setRecentOpen(true);
                setSearchOpen(false);
                setQuery("");
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
                pathname.startsWith("/c/")
                  ? "bg-zinc-800/80 text-zinc-50"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
              )}
            >
              <MessagesSquare className="h-4 w-4 shrink-0" />
              Chats
            </button>

            <div
              className="flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-zinc-600"
              title="Coming soon"
            >
              <LayoutGrid className="h-4 w-4 shrink-0" />
              Projects
              <span className="ml-auto text-[10px] text-zinc-600">Soon</span>
            </div>
          </nav>

          {/* Search field */}
          {searchOpen && (
            <div className="mb-2 px-0.5">
              <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2">
                <Search className="h-3.5 w-3.5 text-zinc-500" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search chats…"
                  className="w-full bg-transparent text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600"
                />
              </div>
            </div>
          )}

          {/* Recent chats */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <button
              type="button"
              onClick={() => setRecentOpen((v) => !v)}
              className="mb-1 flex w-full items-center justify-between px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500 transition-colors hover:text-zinc-300"
            >
              Recent chats
              {recentOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>

            {recentOpen && (
              <ul className="space-y-0.5 pb-2">
                {filtered.map((chat) => {
                  const active = pathname === `/c/${chat.id}`;
                  return (
                    <li key={chat.id} className="group relative">
                      <Link
                        href={`/c/${chat.id}`}
                        className={cn(
                          "flex items-center gap-2 truncate rounded-lg px-2.5 py-2 pr-9 text-[13px] transition-colors",
                          active
                            ? "bg-zinc-800/80 text-zinc-50"
                            : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
                        )}
                      >
                        <CircleDashed className="h-3.5 w-3.5 shrink-0 opacity-50" />
                        <span className="truncate">{chat.title}</span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(chat)}
                        className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-100 group-hover:block"
                        aria-label="Delete chat"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
                {!filtered.length && (
                  <li className="px-2.5 py-2 text-[12px] text-zinc-600">
                    {query ? "No matching chats" : "No chats yet"}
                  </li>
                )}
              </ul>
            )}
          </div>

          {/* Promo + profile footer */}
          <div className="mt-auto space-y-2 pt-2">
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3">
              <div className="mb-1 flex items-start justify-between gap-2">
                <p className="text-[13px] font-semibold text-zinc-50">
                  {billing?.planId === "pro"
                    ? "You're on Pro"
                    : billing?.planId === "plus"
                      ? "You're on Plus"
                      : "Upgrade your plan"}
                </p>
                <Sparkles className="h-4 w-4 shrink-0 text-emerald-400/80" />
              </div>
              <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
                {billing?.billingExempt
                  ? "Owner account with unlimited builder credits."
                  : billing?.planId === "free"
                    ? "Unlock Luca Turbo, more credits, and deeper thinking."
                    : "Compare plans or move to Pro for Luca Ultra."}
              </p>
              <button
                type="button"
                onClick={() => openPlans()}
                className="inline-flex h-8 items-center rounded-lg border border-zinc-700 px-2.5 text-[12px] font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800 hover:text-white"
              >
                {billing?.planId === "pro" ? "View plans" : "Change plan"}
              </button>
            </div>

            {authLoading ? (
              <div className="h-11 rounded-xl bg-zinc-900/50" />
            ) : user ? (
              <div className="flex items-center gap-2.5 rounded-xl px-1.5 py-1.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-bold text-zinc-900">
                  {userInitials(user.name, user.email)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-zinc-200">
                    {user.name}
                  </p>
                  <p className="truncate text-[10px] text-zinc-500">
                    {user.email}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => openAuth("login")}
                  className="flex h-9 flex-1 items-center justify-center rounded-lg border border-zinc-800 text-[12px] text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => openAuth("signup")}
                  className="flex h-9 flex-1 items-center justify-center rounded-lg bg-zinc-100 text-[12px] font-medium text-zinc-950 transition-colors hover:bg-white"
                >
                  Sign up
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {deleteTarget &&
        createPortal(
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <button
              type="button"
              aria-label="Close"
              className="absolute inset-0 bg-black/70 backdrop-blur-[1px]"
              disabled={deleting}
              onClick={() => !deleting && setDeleteTarget(null)}
            />
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-chat-title"
              aria-describedby="delete-chat-desc"
              className="relative z-10 w-full max-w-[400px] overflow-hidden rounded-xl border border-zinc-800 bg-[#141414] shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            >
              <div className="space-y-2 px-6 pt-6 pb-5">
                <h2
                  id="delete-chat-title"
                  className="text-[17px] font-semibold tracking-tight text-white"
                >
                  Delete chat?
                </h2>
                <p
                  id="delete-chat-desc"
                  className="text-[14px] leading-relaxed text-zinc-400"
                >
                  <span className="font-medium text-zinc-300">
                    {deleteTarget.title}
                  </span>{" "}
                  will be permanently deleted, including its messages and
                  project files. This can&apos;t be undone.
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-4 py-3">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setDeleteTarget(null)}
                  className="h-9 rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 text-[13px] font-medium text-zinc-100 transition-colors hover:bg-zinc-800 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={confirmDeleteChat}
                  className="h-9 rounded-lg bg-red-500 px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-red-400 active:bg-red-600 disabled:opacity-60"
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

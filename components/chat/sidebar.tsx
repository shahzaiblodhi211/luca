"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  CircleDashed,
  CreditCard,
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
import { openVercelConnectModal } from "@/components/preview/vercel-connect-modal";
import { usePlansModal } from "@/components/billing/plans-modal";
import { LucaMark } from "@/components/brand/logo";
import { ShimmerBlock } from "@/components/ui/shimmer-block";
import { cn } from "@/lib/utils";
import type { ChatSummary } from "@/lib/types";
import { useShell } from "./shell-context";

const SIDEBAR_W = "w-[260px]";
const RECENT_PAGE_SIZE = 10;

function RecentChatSkeleton() {
  return (
    <li className="flex items-center gap-2 px-2.5 py-2">
      <ShimmerBlock className="h-3.5 w-3.5 shrink-0 rounded-full" />
      <ShimmerBlock className="h-3 w-[70%] rounded-full" />
    </li>
  );
}

function userInitials(name?: string | null, email?: string | null) {
  const src = (name || email || "L").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  }
  return src.slice(0, 2).toUpperCase();
}

function UserAvatar({
  name,
  email,
  imageUrl,
  size = "md",
}: {
  name: string;
  email: string;
  imageUrl?: string;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-6 w-6" : "h-8 w-8";
  const text = size === "sm" ? "text-[10px]" : "text-[11px]";

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        width={size === "sm" ? 24 : 32}
        height={size === "sm" ? 24 : 32}
        className={cn(
          "shrink-0 rounded-full object-cover bg-zinc-800 ring-1 ring-zinc-700/80",
          dim,
        )}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-zinc-100 font-bold text-zinc-900",
        dim,
        text,
      )}
    >
      {userInitials(name, email)}
    </div>
  );
}

function FigmaMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 38 57"
      aria-hidden
      className={cn("h-4 w-3 shrink-0", className)}
    >
      <path fill="#1ABCFE" d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" />
      <path fill="#0ACF83" d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" />
      <path fill="#FF7262" d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" />
      <path fill="#F24E1E" d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" />
      <path fill="#A259FF" d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" />
    </svg>
  );
}

function accountHandle(user: { name: string; email: string }) {
  const local = user.email.split("@")[0]?.trim();
  if (local) return local;
  return user.name.trim().split(/\s+/)[0]?.toLowerCase() || "user";
}

export function Sidebar({
  initialChats,
}: {
  initialChats?: ChatSummary[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    openAuth,
    user,
    billing,
    loading: authLoading,
    logout,
    refreshUser,
    figmaOAuthConfigured,
    vercelOAuthConfigured,
  } = useAuthModal();
  const { sidebarOpen, toggleSidebar } = useShell();
  const { openPlans } = usePlansModal();
  const [chats, setChats] = useState<ChatSummary[]>(
    (initialChats ?? []).slice(0, RECENT_PAGE_SIZE),
  );
  const [hasMoreChats, setHasMoreChats] = useState(
    (initialChats?.length ?? 0) > RECENT_PAGE_SIZE,
  );
  const [chatsLoading, setChatsLoading] = useState(
    !(initialChats && initialChats.length),
  );
  const [chatsLoadingMore, setChatsLoadingMore] = useState(false);
  const [recentOpen, setRecentOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChatSummary | null>(null);
  const [deleting, startDelete] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const recentListRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLLIElement>(null);
  const loadMoreLock = useRef(false);

  const isHome = pathname === "/";
  const isProjects = pathname === "/projects";
  const isChatsPage = pathname === "/chats";
  const isChat = pathname.startsWith("/c/");

  useEffect(() => {
    let cancelled = false;
    async function loadFirstPage() {
      if (!user) {
        if (!cancelled) {
          setChats([]);
          setHasMoreChats(false);
          setChatsLoading(false);
        }
        return;
      }
      if (chats.length) {
        setChatsLoading(false);
        return;
      }
      setChatsLoading(true);
      try {
        const res = await fetch(
          `/api/chats?limit=${RECENT_PAGE_SIZE}&offset=0`,
        );
        if (!res.ok) {
          if (!cancelled) {
            setChats([]);
            setHasMoreChats(false);
          }
          return;
        }
        const data = (await res.json()) as {
          chats: ChatSummary[];
          hasMore?: boolean;
        };
        if (!cancelled) {
          setChats(data.chats);
          setHasMoreChats(Boolean(data.hasMore));
        }
      } catch {
        if (!cancelled) {
          setChats([]);
          setHasMoreChats(false);
        }
      } finally {
        if (!cancelled) setChatsLoading(false);
      }
    }
    void loadFirstPage();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!pathname.startsWith("/c/")) return;
    const id = pathname.slice(3).split("/")[0];
    if (!id) return;
    setChats((prev) => {
      if (prev.some((c) => c.id === id)) return prev;
      return [
        {
          id,
          title: "New chat",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          projectId: null,
          hasProject: false,
        },
        ...prev,
      ];
    });
  }, [pathname]);

  useEffect(() => {
    function onChatTitle(e: Event) {
      const detail = (e as CustomEvent<{ id: string; title: string }>).detail;
      if (!detail?.id || !detail.title) return;
      setChats((prev) =>
        prev.map((c) =>
          c.id === detail.id
            ? { ...c, title: detail.title, updatedAt: new Date().toISOString() }
            : c,
        ),
      );
    }
    window.addEventListener("luca-chat-title", onChatTitle);
    return () => window.removeEventListener("luca-chat-title", onChatTitle);
  }, []);

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

  async function loadMoreChats() {
    if (!user || loadMoreLock.current || chatsLoadingMore || !hasMoreChats) {
      return;
    }
    loadMoreLock.current = true;
    setChatsLoadingMore(true);
    try {
      const res = await fetch(
        `/api/chats?limit=${RECENT_PAGE_SIZE}&offset=${chats.length}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        chats: ChatSummary[];
        hasMore?: boolean;
      };
      setChats((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...data.chats.filter((c) => !seen.has(c.id))];
      });
      setHasMoreChats(Boolean(data.hasMore));
    } finally {
      loadMoreLock.current = false;
      setChatsLoadingMore(false);
    }
  }

  useEffect(() => {
    const root = recentListRef.current;
    if (!root || !hasMoreChats || chatsLoading || query.trim()) return;
    function onScroll() {
      if (!root) return;
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 40) {
        void loadMoreChats();
      }
    }
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, [hasMoreChats, chatsLoading, chats.length, query, user?.id]);

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
  const creditsBadgeTitle = billing?.billingExempt
    ? "Unlimited credits"
    : billing
      ? `${billing.creditsRemainingToday.toLocaleString()} of ${billing.dailyCredits.toLocaleString()} credits left today`
      : undefined;

  const upgradeLabel =
    billing?.billingExempt || billing?.planId === "pro"
      ? null
      : billing?.planId === "plus"
        ? "Upgrade to Pro"
        : "Upgrade to Plus";

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

          {/* Workspace label */}
          <div className="mb-2 flex items-center gap-2.5 rounded-xl px-2.5 py-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-500/25">
              {userInitials(user?.name, user?.email)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-zinc-100">
                {workspaceLabel}
              </p>
              <p className="truncate text-[11px] text-zinc-500">
                {user ? planLabel : "Sign in to sync chats"}
              </p>
            </div>
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
                isHome && !isChat && !isProjects && !isChatsPage
                  ? "bg-zinc-800/80 text-zinc-50"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
              )}
            >
              <Home className="h-4 w-4 shrink-0" />
              Home
            </Link>

            <Link
              href="/chats"
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
                isChatsPage
                  ? "bg-zinc-800/80 text-zinc-50"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
              )}
            >
              <MessagesSquare className="h-4 w-4 shrink-0" />
              Chats
            </Link>

            <Link
              href="/projects"
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
                isProjects
                  ? "bg-zinc-800/80 text-zinc-50"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
              )}
            >
              <LayoutGrid className="h-4 w-4 shrink-0" />
              Projects
            </Link>
          </nav>

          {/* Search field */}
          {searchOpen && (
            <div className="mb-2 px-0.5">
              <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-transparent px-2.5 py-2">
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
          <div
            ref={recentListRef}
            className="luca-hover-scroll min-h-0 flex-1 overflow-y-auto"
          >
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
                {chatsLoading
                  ? Array.from({ length: RECENT_PAGE_SIZE }, (_, i) => (
                      <RecentChatSkeleton key={`recent-skel-${i}`} />
                    ))
                  : filtered.map((chat) => {
                      const active = pathname === `/c/${chat.id}`;
                      return (
                        <li key={chat.id} className="group relative">
                          <Link
                            href={`/c/${chat.id}`}
                            className={cn(
                              "flex items-center gap-2 rounded-lg px-2.5 py-2 pr-2 text-[13px] transition-colors group-hover:pr-8",
                              active
                                ? "bg-zinc-800/80 text-zinc-50"
                                : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
                            )}
                          >
                            <CircleDashed className="h-3.5 w-3.5 shrink-0 opacity-50" />
                            <span className="min-w-0 flex-1 truncate">{chat.title}</span>
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
                {!chatsLoading && !filtered.length && (
                  <li className="px-2.5 py-2 text-[12px] text-zinc-600">
                    {query ? "No matching chats" : "No chats yet"}
                  </li>
                )}
                {!chatsLoading && hasMoreChats && !query.trim() && (
                  <>
                    {chatsLoadingMore && (
                      <>
                        <RecentChatSkeleton />
                        <RecentChatSkeleton />
                      </>
                    )}
                    <li ref={loadMoreRef} className="h-4 list-none" />
                  </>
                )}
              </ul>
            )}
          </div>

          {/* Account footer */}
          <div className="relative mt-auto pt-2" ref={accountRef}>
            {authLoading ? (
              <div className="h-10 overflow-hidden rounded-xl">
                <ShimmerBlock className="h-full w-full rounded-xl" />
              </div>
            ) : user ? (
              <>
                <div className="flex items-stretch gap-2">
                  <button
                    type="button"
                    onClick={() => setAccountOpen((v) => !v)}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2.5 rounded-xl bg-zinc-800/70 px-2.5 py-2 text-left transition-colors hover:bg-zinc-800",
                      accountOpen && "bg-zinc-800",
                    )}
                  >
                    <UserAvatar
                      size="sm"
                      name={user.name}
                      email={user.email}
                      imageUrl={user.imageUrl}
                    />
                    <span className="truncate text-[13px] font-medium text-zinc-100">
                      {accountHandle(user)}
                    </span>
                  </button>
                  <div
                    className="flex shrink-0 items-center justify-center rounded-xl border border-zinc-700/70 bg-zinc-900/50 px-3 py-2 text-[13px] font-medium tabular-nums text-zinc-200"
                    title={creditsBadgeTitle}
                  >
                    {billing?.billingExempt ? (
                      "∞"
                    ) : billing ? (
                      billing.creditsRemainingToday.toLocaleString()
                    ) : (
                      "—"
                    )}
                  </div>
                </div>

                {accountOpen && (
                  <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-50 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
                    <div className="flex items-center gap-3 px-3.5 py-3">
                      <UserAvatar
                        name={user.name}
                        email={user.email}
                        imageUrl={user.imageUrl}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-white">
                          {accountHandle(user)}
                        </p>
                        <p className="truncate text-[12px] text-zinc-500">
                          {user.email}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">
                        {planLabel}
                      </span>
                    </div>

                    <div className="mx-2 rounded-xl bg-zinc-900/70 px-3 py-2">
                      <div className="flex items-center justify-between py-1.5 text-[12.5px]">
                        <span className="text-zinc-400">Credits today</span>
                        <span className="font-medium tabular-nums text-zinc-100">
                          {billing?.billingExempt
                            ? "Unlimited"
                            : billing
                              ? `${billing.creditsRemainingToday.toLocaleString()} / ${billing.dailyCredits.toLocaleString()}`
                              : "0 / 0"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 text-[12.5px]">
                        <span className="text-zinc-400">Credits this month</span>
                        <span className="font-medium tabular-nums text-zinc-100">
                          {billing?.billingExempt
                            ? "Unlimited"
                            : `${billing?.creditsRemaining.toLocaleString() ?? "0"} left`}
                        </span>
                      </div>
                    </div>

                    <div className="mt-1.5 p-1.5">
                      <Link
                        href="/billing"
                        onClick={() => setAccountOpen(false)}
                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
                      >
                        <span>Manage billing</span>
                        <CreditCard className="h-3.5 w-3.5 text-zinc-500" />
                      </Link>

                      {user.vercelConnected ? (
                        <button
                          type="button"
                          onClick={() => {
                            void fetch("/api/integrations/vercel", {
                              method: "DELETE",
                            }).then(() => refreshUser());
                          }}
                          className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
                        >
                          <span>Disconnect Vercel</span>
                          <span className="text-[11px] text-zinc-500">
                            {user.vercelUsername || "connected"}
                          </span>
                        </button>
                      ) : (
                        vercelOAuthConfigured ? (
                          <a
                            href={`/api/integrations/vercel/connect?return=${encodeURIComponent(pathname || "/")}`}
                            onClick={() => setAccountOpen(false)}
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
                          >
                            <span>Connect Vercel</span>
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setAccountOpen(false);
                              openVercelConnectModal();
                            }}
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
                          >
                            <span>Connect Vercel</span>
                          </button>
                        )
                      )}

                      {(billing?.figmaEnabled ||
                        billing?.planId === "plus" ||
                        billing?.planId === "pro") &&
                        (user.figmaConnected ? (
                          <button
                            type="button"
                            onClick={() => {
                              void fetch("/api/integrations/figma", {
                                method: "DELETE",
                              }).then(() => refreshUser());
                            }}
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
                          >
                            <span>Disconnect Figma</span>
                            <FigmaMark />
                          </button>
                        ) : (
                          <a
                            href={
                              figmaOAuthConfigured
                                ? `/api/integrations/figma/connect?return=${encodeURIComponent(pathname || "/")}`
                                : "/billing"
                            }
                            onClick={() => setAccountOpen(false)}
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
                          >
                            <span>Connect Figma</span>
                            <FigmaMark />
                          </a>
                        ))}

                      <button
                        type="button"
                        onClick={() => {
                          setAccountOpen(false);
                          void logout().then(() => {
                            setChats([]);
                            router.push("/");
                          });
                        }}
                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
                      >
                        <span>Sign out</span>
                        <LogOut className="h-3.5 w-3.5 text-zinc-500" />
                      </button>
                    </div>

                    {upgradeLabel && (
                      <div className="p-2 pt-0">
                        <button
                          type="button"
                          onClick={() => {
                            setAccountOpen(false);
                            openPlans();
                          }}
                          className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-[13px] font-medium text-zinc-100 transition-colors hover:bg-zinc-800 hover:text-white"
                        >
                          <Sparkles className="h-3.5 w-3.5 text-zinc-400" />
                          {upgradeLabel}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => openAuth("login")}
                  className="flex h-10 flex-1 items-center justify-center rounded-xl bg-zinc-800/70 text-[13px] text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => openAuth("signup")}
                  className="flex h-10 flex-1 items-center justify-center rounded-xl bg-emerald-600 text-[13px] font-medium text-white transition-colors hover:bg-emerald-500"
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

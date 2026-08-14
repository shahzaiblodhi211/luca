"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  CircleDashed,
  Filter,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useAuthModal } from "@/components/auth/auth-context";
import { LucaMark } from "@/components/brand/logo";
import { ShimmerBlock } from "@/components/ui/shimmer-block";
import { formatTimeAgo } from "@/lib/format-time-ago";
import type { ChatSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

type FilterMode = "all" | "drafts" | "projects";
type SortKey = "updated" | "name";

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
}: {
  name?: string | null;
  email?: string | null;
  imageUrl?: string | null;
}) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        width={24}
        height={24}
        className="h-6 w-6 shrink-0 rounded-full object-cover bg-zinc-800 ring-1 ring-zinc-700/80"
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-bold text-zinc-900">
      {userInitials(name, email)}
    </div>
  );
}

function ChatRowMenu({
  chat,
  onDeleted,
}: {
  chat: ChatSummary;
  onDeleted: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [deleting, startDelete] = useTransition();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setPos({
      top: rect.bottom + 6,
      left: Math.max(8, rect.right - 160),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const menu =
    open && pos ? (
      <div
        ref={menuRef}
        style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 200 }}
        className="min-w-[10rem] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 py-1 shadow-xl shadow-black/50"
      >
        <Link
          href={`/c/${chat.id}`}
          className="block px-3 py-2 text-[13px] text-zinc-200 hover:bg-zinc-900"
          onClick={() => setOpen(false)}
        >
          Open chat
        </Link>
        <button
          type="button"
          disabled={deleting}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-red-400 hover:bg-zinc-900 disabled:opacity-50"
          onClick={() => {
            setOpen(false);
            startDelete(async () => {
              const res = await fetch(`/api/chats/${chat.id}`, {
                method: "DELETE",
              });
              if (res.ok) onDeleted(chat.id);
            });
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>
    ) : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="Chat options"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="rounded-md p-1 text-zinc-500 opacity-0 transition-opacity hover:bg-zinc-800 hover:text-zinc-300 group-hover:opacity-100"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {mounted && menu ? createPortal(menu, document.body) : null}
    </>
  );
}

function ChatRow({
  chat,
  onDeleted,
  user,
}: {
  chat: ChatSummary;
  onDeleted: (id: string) => void;
  user: { name?: string | null; email?: string | null; imageUrl?: string | null };
}) {
  const hasProject = chat.hasProject ?? Boolean(chat.projectId);

  return (
    <Link
      href={`/c/${chat.id}`}
      className="group grid grid-cols-[1fr_160px_140px_72px_32px] items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-[#1a1a1a] sm:grid-cols-[minmax(0,1fr)_180px_160px_80px_32px]"
    >
      <span className="truncate text-[13px] font-medium text-zinc-100">
        {chat.title}
      </span>
      <span className="flex min-w-0 items-center gap-2 text-[13px] text-zinc-500">
        {hasProject ? (
          <>
            <LucaMark size="xs" className="opacity-70" />
            <span className="truncate">
              {chat.projectId || "Project"}
            </span>
          </>
        ) : (
          <>
            <CircleDashed className="h-3.5 w-3.5 shrink-0 opacity-60" />
            <span>Draft</span>
          </>
        )}
      </span>
      <span className="text-[13px] tabular-nums text-zinc-500">
        {formatTimeAgo(chat.updatedAt)}
      </span>
      <UserAvatar
        name={user.name}
        email={user.email}
        imageUrl={user.imageUrl}
      />
      <ChatRowMenu chat={chat} onDeleted={onDeleted} />
    </Link>
  );
}

function ChatRowSkeleton() {
  return (
    <div className="grid grid-cols-[1fr_160px_140px_72px_32px] items-center gap-3 rounded-lg px-2 py-2.5 sm:grid-cols-[minmax(0,1fr)_180px_160px_80px_32px]">
      <ShimmerBlock className="h-3.5 w-2/3 rounded-full" />
      <ShimmerBlock className="h-3.5 w-16 rounded-full" />
      <ShimmerBlock className="h-3.5 w-12 rounded-full" />
      <ShimmerBlock className="h-6 w-6 rounded-full" />
      <div />
    </div>
  );
}

export function ChatsPage({ initialChats }: { initialChats: ChatSummary[] }) {
  const router = useRouter();
  const { user, openAuth } = useAuthModal();
  const [chats, setChats] = useState(initialChats);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>("updated");
  const [refreshing, setRefreshing] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      setRefreshing(true);
      try {
        const res = await fetch("/api/chats");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { chats?: ChatSummary[] };
        if (!cancelled && data.chats) setChats(data.chats);
      } catch {
        /* keep SSR list */
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

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
    if (!filterOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [filterOpen]);

  const filtered = useMemo(() => {
    let rows = [...chats];
    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          (c.projectId?.toLowerCase().includes(q) ?? false),
      );
    }
    if (filter === "drafts") {
      rows = rows.filter((c) => !(c.hasProject ?? c.projectId));
    } else if (filter === "projects") {
      rows = rows.filter((c) => c.hasProject ?? Boolean(c.projectId));
    }
    rows.sort((a, b) => {
      if (sort === "name") {
        return a.title.localeCompare(b.title);
      }
      return (
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    });
    return rows;
  }, [chats, query, filter, sort]);

  function onNewChat() {
    if (!user) {
      openAuth("login");
      return;
    }
    router.push("/");
  }

  const filterLabel =
    filter === "drafts"
      ? "Drafts"
      : filter === "projects"
        ? "With project"
        : "All chats";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
          Chats
        </h1>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats…"
              className={cn(
                "h-10 w-full rounded-lg border border-zinc-800 bg-transparent pl-9 pr-3",
                "text-sm text-zinc-100 outline-none placeholder:text-zinc-600",
                "focus:border-zinc-700 focus:ring-1 focus:ring-zinc-700/80",
              )}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onNewChat}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-zinc-700 bg-transparent px-3 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-900"
            >
              <Plus className="h-4 w-4" />
              Chat
            </button>
          </div>
        </div>

        <div className="relative mt-3" ref={filterRef}>
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-transparent px-3 py-1.5 text-[13px] text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
          >
            <Filter className="h-3.5 w-3.5" />
            {filterLabel}
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </button>
          {filterOpen ? (
            <div className="absolute left-0 top-full z-20 mt-1 min-w-[10rem] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 py-1 shadow-xl">
              {(
                [
                  ["all", "All chats"],
                  ["drafts", "Drafts only"],
                  ["projects", "With project"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={cn(
                    "block w-full px-3 py-2 text-left text-[13px] hover:bg-zinc-900",
                    filter === id ? "text-zinc-100" : "text-zinc-400",
                  )}
                  onClick={() => {
                    setFilter(id);
                    setFilterOpen(false);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-6">
          <div className="grid grid-cols-[1fr_160px_140px_72px_32px] gap-3 px-2 py-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500 sm:grid-cols-[minmax(0,1fr)_180px_160px_80px_32px]">
            <button
              type="button"
              className="truncate text-left hover:text-zinc-300"
              onClick={() => setSort("name")}
            >
              Name
            </button>
            <span>Project</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-left hover:text-zinc-300"
              onClick={() => setSort("updated")}
            >
              Updated
              {sort === "updated" ? (
                <ChevronDown className="h-3 w-3" />
              ) : null}
            </button>
            <span className="sr-only">Author</span>
            <span className="sr-only">Actions</span>
          </div>

          {refreshing && chats.length === 0 ? (
            Array.from({ length: 8 }).map((_, i) => (
              <ChatRowSkeleton key={i} />
            ))
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <LucaMark size="lg" className="mb-4 opacity-40" />
              <p className="text-sm font-medium text-zinc-300">
                {query.trim() || filter !== "all"
                  ? "No chats match your filters"
                  : "No chats yet"}
              </p>
              <p className="mt-1 max-w-sm text-sm text-zinc-500">
                {query.trim() || filter !== "all"
                  ? "Try a different search or filter."
                  : "Start a conversation with Luca on the home page."}
              </p>
              {!query.trim() && filter === "all" ? (
                <button
                  type="button"
                  onClick={onNewChat}
                  className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                >
                  <Plus className="h-4 w-4" />
                  New chat
                </button>
              ) : null}
            </div>
          ) : (
            filtered.map((chat) => (
              <ChatRow
                key={chat.id}
                chat={chat}
                onDeleted={(id) =>
                  setChats((prev) => prev.filter((c) => c.id !== id))
                }
                user={{
                  name: user?.name,
                  email: user?.email,
                  imageUrl: user?.imageUrl,
                }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

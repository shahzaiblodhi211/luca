"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useAuthModal } from "@/components/auth/auth-context";
import { LucaMark } from "@/components/brand/logo";
import { ProjectPreviewThumb } from "@/components/projects/project-preview-thumb";
import { ProjectCardSkeleton } from "@/components/ui/shimmer-block";
import { formatTimeAgo } from "@/lib/format-time-ago";
import type { ProjectSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

function ProjectCardMenu({
  project,
  onDeleted,
}: {
  project: ProjectSummary;
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
          href={`/c/${project.id}`}
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
              const res = await fetch(`/api/chats/${project.id}`, {
                method: "DELETE",
              });
              if (res.ok) onDeleted(project.id);
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
        aria-label="Project options"
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

function ProjectCard({
  project,
  onDeleted,
}: {
  project: ProjectSummary;
  onDeleted: (id: string) => void;
}) {
  const subtitle = project.projectId || `${project.fileCount} files`;

  return (
    <Link
      href={`/c/${project.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-900/40 transition-colors hover:border-zinc-700 hover:bg-zinc-900/70"
    >
      <ProjectPreviewThumb chatId={project.id} />
      <div className="flex items-center gap-2.5 border-t border-zinc-800/80 px-3 py-2.5">
        <LucaMark size="xs" className="opacity-80" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-zinc-100">
            {project.title}
          </p>
          <p className="truncate text-[11px] text-zinc-500">
            {formatTimeAgo(project.updatedAt)}
            {subtitle ? ` · ${subtitle}` : ""}
          </p>
        </div>
        <ProjectCardMenu project={project} onDeleted={onDeleted} />
      </div>
    </Link>
  );
}

export function ProjectsPage({
  initialProjects,
}: {
  initialProjects: ProjectSummary[];
}) {
  const router = useRouter();
  const { user, openAuth } = useAuthModal();
  const [projects, setProjects] = useState(initialProjects);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      setRefreshing(true);
      try {
        const res = await fetch("/api/projects");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { projects?: ProjectSummary[] };
        if (!cancelled && data.projects) setProjects(data.projects);
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.projectId?.toLowerCase().includes(q) ?? false),
    );
  }, [projects, query]);

  function onNewProject() {
    if (!user) {
      openAuth("login");
      return;
    }
    router.push("/");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
          Projects
        </h1>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects…"
              className={cn(
                "h-10 w-full rounded-lg border border-zinc-800 bg-transparent pl-9 pr-3",
                "text-sm text-zinc-100 outline-none placeholder:text-zinc-600",
                "focus:border-zinc-700 focus:ring-1 focus:ring-zinc-700/80",
              )}
            />
          </div>
          <button
            type="button"
            onClick={onNewProject}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-zinc-700 bg-transparent px-4 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-900"
          >
            <Plus className="h-4 w-4" />
            Project
          </button>
        </div>

        {filtered.length === 0 ? (
          <div className="mt-16 flex flex-col items-center justify-center text-center">
            <LucaMark size="lg" className="mb-4 opacity-40" />
            <p className="text-sm font-medium text-zinc-300">
              {query.trim() ? "No projects match your search" : "No projects yet"}
            </p>
            <p className="mt-1 max-w-sm text-sm text-zinc-500">
              {query.trim()
                ? "Try a different search term."
                : "Ask Luca to build something — your code projects will show up here."}
            </p>
            {!query.trim() ? (
              <button
                type="button"
                onClick={onNewProject}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              >
                <Plus className="h-4 w-4" />
                New project
              </button>
            ) : null}
          </div>
        ) : refreshing && projects.length === 0 ? (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProjectCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onDeleted={(id) =>
                  setProjects((prev) => prev.filter((p) => p.id !== id))
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

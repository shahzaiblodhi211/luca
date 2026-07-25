"use client";

import Editor from "@monaco-editor/react";
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  Folder,
  FolderOpen,
  Loader2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectFile } from "@/lib/types";
import { cn } from "@/lib/utils";

type TreeNode = {
  name: string;
  path: string;
  children?: TreeNode[];
  file?: ProjectFile;
};

function languageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "ts":
    case "mts":
    case "cts":
      return "typescript";
    case "tsx":
      return "typescript";
    case "js":
    case "mjs":
    case "cjs":
      return "javascript";
    case "jsx":
      return "javascript";
    case "css":
      return "css";
    case "json":
      return "json";
    case "md":
    case "mdx":
      return "markdown";
    case "html":
      return "html";
    case "svg":
      return "xml";
    case "yml":
    case "yaml":
      return "yaml";
    default:
      return "plaintext";
  }
}

function buildTree(files: ProjectFile[]): TreeNode[] {
  type Mutable = {
    name: string;
    path: string;
    children?: Mutable[];
    file?: ProjectFile;
  };
  const root: Mutable[] = [];

  for (const file of files) {
    const path = file.path.replace(/^\/+/, "");
    const parts = path.split("/").filter(Boolean);
    let list = root;
    let acc = "";
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]!;
      acc = acc ? `${acc}/${name}` : name;
      const isFile = i === parts.length - 1;
      if (isFile) {
        const idx = list.findIndex((n) => n.name === name && !n.children);
        const leaf: Mutable = { name, path: acc, file };
        if (idx >= 0) list[idx] = leaf;
        else list.push(leaf);
      } else {
        let dir = list.find((n) => n.name === name && n.children);
        if (!dir) {
          dir = { name, path: acc, children: [] };
          list.push(dir);
        }
        list = dir.children!;
      }
    }
  }

  const sortRec = (nodes: Mutable[]) => {
    nodes.sort((a, b) => {
      const ad = a.children ? 0 : 1;
      const bd = b.children ? 0 : 1;
      if (ad !== bd) return ad - bd;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) if (n.children) sortRec(n.children);
  };
  sortRec(root);
  return root as TreeNode[];
}

function FileTreeNode({
  node,
  depth,
  activePath,
  expanded,
  onToggle,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  activePath: string;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
}) {
  const isDir = Boolean(node.children);
  const open = expanded.has(node.path);
  const active = !isDir && node.path === activePath;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (isDir) onToggle(node.path);
          else onSelect(node.path);
        }}
        className={cn(
          "flex w-full items-center gap-1.5 truncate px-2 py-1 text-left text-[12px]",
          active
            ? "bg-sky-600/25 text-sky-100"
            : "text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200",
        )}
        style={{ paddingLeft: 8 + depth * 12 }}
        title={node.path}
      >
        {isDir ? (
          open ? (
            <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 opacity-70" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {isDir ? (
          open ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400/90" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400/80" />
          )
        ) : (
          <FileCode2 className="h-3.5 w-3.5 shrink-0 text-sky-400/80" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {isDir && open
        ? node.children!.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              activePath={activePath}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))
        : null}
    </div>
  );
}

export function ProjectCodeEditor({
  files,
  onFilesChange,
}: {
  files: ProjectFile[];
  projectId?: string | null;
  packages?: Record<string, string>;
  onFilesChange?: (files: ProjectFile[]) => void;
}) {
  const sorted = useMemo(
    () =>
      [...files].sort((a, b) =>
        a.path.replace(/^\/+/, "").localeCompare(b.path.replace(/^\/+/, "")),
      ),
    [files],
  );
  const tree = useMemo(() => buildTree(sorted), [sorted]);

  const defaultPath =
    sorted.find((f) => /app\/page\.tsx$/i.test(f.path))?.path.replace(/^\/+/, "") ||
    sorted[0]?.path.replace(/^\/+/, "") ||
    "";

  const [activePath, setActivePath] = useState(defaultPath);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const next = new Set<string>();
    for (const f of sorted) {
      const parts = f.path.replace(/^\/+/, "").split("/");
      for (let i = 1; i < parts.length; i++) {
        next.add(parts.slice(0, i).join("/"));
      }
    }
    return next;
  });

  useEffect(() => {
    if (!sorted.length) {
      setActivePath("");
      return;
    }
    const still = sorted.some(
      (f) => f.path.replace(/^\/+/, "") === activePath,
    );
    if (!still) setActivePath(defaultPath);
  }, [sorted, activePath, defaultPath]);

  const activeFile = useMemo(
    () =>
      sorted.find((f) => f.path.replace(/^\/+/, "") === activePath) || null,
    [sorted, activePath],
  );

  const onToggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  if (!sorted.length) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        No project files yet
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-1.5">
        <span className="truncate text-xs text-zinc-400">
          {activePath || "Select a file"}
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="w-52 shrink-0 overflow-y-auto border-r border-zinc-800 bg-zinc-950/80">
          <div className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
            Files · {sorted.length}
          </div>
          {tree.map((node) => (
            <FileTreeNode
              key={node.path}
              node={node}
              depth={0}
              activePath={activePath}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={setActivePath}
            />
          ))}
        </aside>

        <div className="min-w-0 flex-1">
          {activeFile ? (
            <Editor
              height="100%"
              theme="vs-dark"
              path={activeFile.path}
              language={languageFromPath(activeFile.path)}
              value={activeFile.code}
              onChange={(value) => {
                if (value == null || !onFilesChange) return;
                const path = activeFile.path.replace(/^\/+/, "");
                onFilesChange(
                  files.map((f) =>
                    f.path.replace(/^\/+/, "") === path
                      ? { ...f, code: value }
                      : f,
                  ),
                );
              }}
              options={{
                fontSize: 13,
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: "on",
                tabSize: 2,
                automaticLayout: true,
                padding: { top: 12, bottom: 12 },
                renderLineHighlight: "line",
                smoothScrolling: true,
                readOnly: !onFilesChange,
              }}
              loading={
                <div className="flex h-full items-center justify-center gap-2 text-sm text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading editor…
                </div>
              }
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">
              Select a file
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import type { AgentStreamEvent } from "@/lib/agent/events";
import {
  ensurePhaseOnTimeline,
  inferFileAction,
  linesDelta,
  startNewPhase,
  summaryLinesFromText,
  upsertPhaseCommand,
  upsertPhaseFile,
} from "@/lib/agent/build-timeline";
import {
  buildEnvFileContent,
  envExamplePath,
  envLocalPath,
  normalizeEnvVarSpecs,
  projectLooksLikeBackend,
} from "@/lib/agent/env-vars";
import { assertInstallablePackage } from "@/lib/agent/packages";
import { formatThinkingText } from "@/lib/agent/format-thinking-text";
import { sanitizeVisibleReply } from "@/lib/agent/sanitize-visible-reply";
import {
  ensureReactImport,
  ensureUseClientDirective,
  sanitizeGeneratedCode,
} from "@/lib/agent/sanitize-code";
import {
  isHostOwnedPreviewPath,
  normalizePreviewCss,
} from "@/lib/preview/normalize-css";
import type { BuildFileAction, EnvRequestPart } from "@/lib/types";
import { nanoid } from "nanoid";

function finalizeSourceCode(path: string, code: string): string {
  let next = sanitizeGeneratedCode(code);
  const isTsx = /\.(tsx|jsx)$/i.test(path);
  const isLayout = /(^|\/)layout\.tsx$/i.test(path);
  if (isTsx && !isLayout) {
    next = ensureUseClientDirective(next);
    next = ensureReactImport(next);
  }
  if (/\.css$/i.test(path)) {
    next = normalizePreviewCss(next);
  }
  return next;
}

function countButtonDeclarations(code: string): number {
  return (
    code.match(
      /\b(?:export\s+)?(?:const|function|class)\s+Button\b|\bButton\s*=\s*React\.forwardRef\b/g,
    ) || []
  ).length;
}

export type AgentAction = { name: string; description?: string };

export type AgentFile = {
  path: string;
  code: string;
  language?: string;
  query?: string;
  isImage?: boolean;
  aspect?: string;
  /** Served path e.g. `/api/images/{id}` from Imagen / Gemini image gen. */
  imageUrl?: string;
  imageDataUrl?: string;
  imageKind?: "photo" | "logo" | "illustration";
};

export type AgentState = {
  projectId: string;
  thinking: string[];
  files: Map<string, AgentFile>;
  /** Explicit npm deps (name → version) from install_package. */
  packages: Map<string, string>;
  deleted: string[];
  actions: AgentAction[];
  texts: string[];
  finished: boolean;
  /** Ordered chat timeline (phase / summary / status / thinking duration). */
  timeline: import("@/lib/types").AssistantPart[];
  /** Active phase id for grouping file/command events. */
  currentPhaseId: string;
  phaseSeq: number;
  /** Substrings that must appear in project files before finish() (clone mode). */
  cloneRequiredTokens: string[];
  /** Consecutive edit_file misses — force write_file fallback. */
  editFailStreak: number;
  editFailPath: string;
  /** True after request_env_vars ran (required before finish when backend exists). */
  envRequested: boolean;
};

export function createAgentState(projectId?: string | null): AgentState {
  return {
    projectId: projectId || "project",
    thinking: [],
    files: new Map(),
    packages: new Map(),
    deleted: [],
    actions: [],
    texts: [],
    finished: false,
    timeline: [],
    currentPhaseId: "",
    phaseSeq: 1,
    cloneRequiredTokens: [],
    editFailStreak: 0,
    editFailPath: "",
    envRequested: false,
  };
}

function normalizeNewlines(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function phaseIdFromArgs(state: AgentState, args: Record<string, unknown>): string {
  const fromArg = String(args.phase_id || args.phaseId || "").trim();
  if (fromArg) {
    state.currentPhaseId = fromArg;
    return fromArg;
  }
  const { phaseId } = ensurePhaseOnTimeline(state, "Building project files");
  return phaseId;
}

function projectIsUiBuild(files: Map<string, AgentFile>): boolean {
  for (const p of files.keys()) {
    if (/^(app|components)\/.*\.(tsx|jsx)$/i.test(p)) return true;
  }
  return false;
}

function projectHasGeneratedLogoFile(files: Map<string, AgentFile>): boolean {
  for (const f of files.values()) {
    if (
      f.isImage &&
      (f.imageKind === "logo" ||
        /logo|wordmark|brand-mark|favicon/i.test(f.path))
    ) {
      return true;
    }
  }
  return false;
}

function logoReferencedInUi(files: Map<string, AgentFile>): boolean {
  const blob = [...files.values()]
    .filter((f) => !f.isImage && f.code)
    .map((f) => f.code)
    .join("\n");
  if (/src=["']https?:\/\/[^"']+/i.test(blob) && /logo/i.test(blob)) {
    return true;
  }
  return /["']\/images\/(logo|mark)[^"']*["']/i.test(blob);
}

function projectHasLogoAsset(files: Map<string, AgentFile>): boolean {
  const generated = projectHasGeneratedLogoFile(files);
  const wired = logoReferencedInUi(files);
  if (generated) return wired;
  return wired;
}

export const AGENT_TOOL_DECLARATIONS = [
  {
    name: "phase",
    description:
      "REQUIRED before each batch of file/package work. One short plain sentence describing what you are about to build (e.g. \"Setting up the cart state and product data\"). No hype. Call this, then emit the write_file / install_package tools for that batch in the SAME step.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "One narrative sentence for the upcoming file/command batch",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "think",
    description:
      "Planning shown in the Reasoning panel. Plain paragraphs only — no headings or bullet lists. Include art direction, fonts, hex tokens, route map, packages.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description:
            "Paragraphs only (no # headings). Start with what the user wants; then brand, thesis, fonts, colors, layout, routes, packages.",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "set_project",
    description:
      "Set or keep the project id. Reuse the same id across edits unless starting a brand new project.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Stable project id, kebab-case" },
      },
      required: ["id"],
    },
  },
  {
    name: "write_file",
    description:
      "Create a NEW file or fully rewrite a file. Call `phase` first for the batch. For small edits prefer edit_file.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: 'File path like "app/page.tsx" or "components/hero.tsx"',
        },
        code: {
          type: "string",
          description: "Full file source code",
        },
        language: {
          type: "string",
          description: "Optional language hint: tsx, ts, css, js",
        },
        phase_id: {
          type: "string",
          description: "Optional phase id from the preceding phase tool",
        },
      },
      required: ["path", "code"],
    },
  },
  {
    name: "edit_file",
    description:
      "Surgically edit an existing project file by replacing an exact old_string with new_string. Prefer this for follow-up edits. Call `phase` first.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: 'Existing file path like "app/page.tsx"',
        },
        old_string: {
          type: "string",
          description:
            "Exact text to find in the current file (copy from CURRENT PROJECT FILES)",
        },
        new_string: {
          type: "string",
          description: "Replacement text (only the changed portion)",
        },
        replace_all: {
          type: "boolean",
          description:
            "If true, replace every match. Default false (requires a unique old_string).",
        },
        phase_id: {
          type: "string",
          description: "Optional phase id from the preceding phase tool",
        },
      },
      required: ["path", "old_string", "new_string"],
    },
  },
  {
    name: "generate_image",
    description:
      "CHAT ONLY — generate a logo/photo/illustration and show it in the chat reply. Use when the user asks to generate/create/design an image or logo and is NOT asking you to build a website/app. Do NOT call set_project / write_file / install_package. After generating, finish (or a short message_user).",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            'Visual brief (e.g. "minimal geometric logo for NexaCore, deep indigo and silver")',
        },
        kind: {
          type: "string",
          description: '"logo" | "photo" | "illustration" — use logo for brand marks',
        },
        aspect: {
          type: "string",
          description: "Optional: 1:1 (default for logo), 16:9, 9:16, 4:3, 3:4",
        },
        caption: {
          type: "string",
          description: "Optional short caption shown under the image in chat",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "write_image",
    description:
      "PROJECT ONLY — generate images into the Code Project via Luca's image pipeline (hero, product, avatar, brand mark). REQUIRED on every UI build: at least one write_image with kind logo (e.g. public/images/logo.png) matching the art direction, then use IMAGE_SRC in header/layout/favicon. Batch logos + heroes in step 1 with install_package. Never invent URLs or placeholders. Chat-only \"generate a logo\" (no app) → generate_image instead.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            'Logical path e.g. "public/images/hero.jpg" or "public/images/logo.png"',
        },
        query: {
          type: "string",
          description:
            'Detailed visual brief (e.g. "artisan coffee cup steam dark wood table" or "minimal wordmark logo for Verveine coffee, cream and charcoal")',
        },
        aspect: {
          type: "string",
          description: "Optional aspect: 16:9, 1:1, 9:16, 4:3, 3:4",
        },
        kind: {
          type: "string",
          description:
            'Image type: "photo" (default), "logo" (brand mark), or "illustration"',
        },
      },
      required: ["path", "query"],
    },
  },
  {
    name: "delete_file",
    description: "Delete a file from the current project. Call `phase` first.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        phase_id: { type: "string" },
      },
      required: ["path"],
    },
  },
  {
    name: "install_package",
    description:
      "Install an npm dependency into the preview runtime. Call `phase` first, then batch all installs together. Do NOT install next/react/react-dom.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: 'Package name, e.g. "sonner" or "@radix-ui/react-toast"',
        },
        version: {
          type: "string",
          description:
            "Optional semver (e.g. 1.7.1). Omit to use a pinned/compatible version.",
        },
        phase_id: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "message_user",
    description:
      "Chat/Q&A only — short plain reply. For builds: use `phase` during work and `finish.summary` at the end. Never per-file narration.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string" },
      },
      required: ["text"],
    },
  },
  {
    name: "suggest_actions",
    description:
      "Suggest 6-7 follow-up actions after finishing the main task. Advanced next steps only. For stores/boutiques NEVER suggest: shop page, PDP, cart, checkout, search, filters, size guide, admin CRUD, profile/account, or live images — those must already ship on turn 1. When backend was requested NEVER suggest 'add real auth/DB/wire APIs' — that E2E wiring was owed before finish. Suggest email providers, analytics, Stripe live-mode hardening instead.",
    parameters: {
      type: "object",
      properties: {
        actions: {
          type: "array",
          description: "Prefer 6–7 short action names",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
            },
            required: ["name"],
          },
        },
      },
      required: ["actions"],
    },
  },
  {
    name: "request_env_vars",
    description:
      "REQUIRED when shipping a real backend/DB/auth/payments. Writes project `.env.local` + `.env.example` with empty keys, then opens an Environment modal in chat so the user pastes secrets (MongoDB URI, JWT secret, Stripe keys, etc.). Include clear howToGet instructions per variable. Call once after API/db files exist; continue building assuming process.env.* will be filled.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description:
            'Modal title, e.g. "Connect your database" or "Environment variables"',
        },
        description: {
          type: "string",
          description:
            "Short explanation shown above the form (what these vars power).",
        },
        database: {
          type: "string",
          description:
            'DB the user chose or you recommended: "mongodb" | "postgres" | "supabase" | "mysql" | "sqlite" | other',
        },
        vars: {
          type: "array",
          description: "Environment variables the user must provide",
          items: {
            type: "object",
            properties: {
              key: {
                type: "string",
                description: 'Env key, e.g. "MONGODB_URI"',
              },
              label: {
                type: "string",
                description: 'Human label, e.g. "MongoDB connection string"',
              },
              description: {
                type: "string",
                description: "What this variable is used for in the app",
              },
              howToGet: {
                type: "string",
                description:
                  "Step-by-step: where to create/copy this value (Atlas Connect, Stripe Dashboard, openssl, etc.)",
              },
              placeholder: { type: "string" },
              required: { type: "boolean" },
              secret: { type: "boolean" },
            },
            required: ["key", "label"],
          },
        },
      },
      required: ["vars"],
    },
  },
  {
    name: "finish",
    description:
      "End the turn after shipping the full ask. summary = plain one-line-per-feature-area bullets (no marketing adjectives like stunning/award-caliber).",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description:
            "Plain lines of what got built (one feature area per line). No hype.",
        },
      },
    },
  },
] as const;

export type ToolName = (typeof AGENT_TOOL_DECLARATIONS)[number]["name"];

export async function executeAgentTool(
  state: AgentState,
  name: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; result: string; events: AgentStreamEvent[] }> {
  switch (name) {
    case "phase": {
      const text = String(args.text || "").trim();
      if (!text) return { ok: false, result: "phase.text required", events: [] };
      const phaseId = startNewPhase(state, text);
      return {
        ok: true,
        result: `phase=${phaseId}`,
        events: [{ type: "phase", id: phaseId, text }],
      };
    }
    case "think": {
      const text = formatThinkingText(String(args.text || "").trim());
      if (!text) return { ok: false, result: "think.text required", events: [] };
      state.thinking.push(text);
      const words = text.split(/\s+/).length;
      const durationSec = Math.max(1, Math.min(12, Math.round(words / 40)));
      const appendText = (prev: string, chunk: string) =>
        prev && chunk ? `${prev}\n\n${chunk}` : prev + chunk;
      const thinkIdx = state.timeline.findIndex((p) => p.type === "thinking");
      const events: AgentStreamEvent[] = [];
      if (thinkIdx < 0) {
        events.push({ type: "thinking", text: "" });
      }
      const prevText =
        thinkIdx >= 0 && state.timeline[thinkIdx].type === "thinking"
          ? state.timeline[thinkIdx].text
          : "";
      if (!prevText.includes(text)) {
        events.push({ type: "thinking_delta", text });
      }
      if (thinkIdx >= 0) {
        const prev = state.timeline[thinkIdx];
        const prevSec =
          prev.type === "thinking" ? prev.durationSec ?? 0 : 0;
        const prevText = prev.type === "thinking" ? prev.text : "";
        state.timeline[thinkIdx] = {
          type: "thinking",
          text: appendText(prevText, text),
          durationSec: Math.max(1, prevSec + durationSec),
        };
      } else {
        state.timeline.unshift({
          type: "thinking",
          text,
          durationSec,
        });
      }
      events.push({ type: "thinking_done", durationSec });
      return {
        ok: true,
        result: "recorded",
        events,
      };
    }
    case "set_project": {
      const id = String(args.id || "")
        .trim()
        .replace(/\s+/g, "-");
      if (!id) return { ok: false, result: "set_project.id required", events: [] };
      state.projectId = id;
      return {
        ok: true,
        result: `project=${id}`,
        events: [{ type: "project", id }],
      };
    }
    case "write_file": {
      const path = String(args.path || "")
        .trim()
        .replace(/^\/+/, "");
      if (!path) return { ok: false, result: "write_file.path required", events: [] };
      if (isHostOwnedPreviewPath(path)) {
        return {
          ok: false,
          result: `Do not write "${path}" — host-owned (Tailwind v4 uses @import "tailwindcss" in CSS + postcss.config; no tailwind.config). Put brand tokens in app/globals.css or app/brand.css instead.`,
          events: [],
        };
      }
      const code = finalizeSourceCode(path, String(args.code ?? ""));
      if (!code.trim()) {
        return { ok: false, result: "write_file.code required", events: [] };
      }
      if (
        /components\/ui\/button\.tsx$/i.test(path) &&
        countButtonDeclarations(code) > 1
      ) {
        return {
          ok: false,
          result:
            'components/ui/button.tsx defines Button more than once — causes "Button is defined multiple times". Write a single Button (one forwardRef/const). Prefer editing the existing scaffold; do not paste two Button components into one file.',
          events: [],
        };
      }
      const language =
        String(args.language || "").trim() ||
        (path.endsWith(".css")
          ? "css"
          : path.endsWith(".ts")
            ? "ts"
            : path.endsWith(".js")
              ? "js"
              : "tsx");
      const existed = state.files.has(path);
      const before = state.files.get(path)?.code;
      const action: BuildFileAction = inferFileAction(existed);
      const delta = linesDelta(before, code);
      const phaseId = phaseIdFromArgs(state, args);
      state.files.set(path, { path, code, language });
      state.deleted = state.deleted.filter((p) => p !== path);
      if (state.editFailPath === path || state.editFailStreak > 0) {
        state.editFailStreak = 0;
        state.editFailPath = "";
      }
      upsertPhaseFile(state, {
        path,
        action,
        status: "done",
        language,
        linesDelta: delta,
      });
      return {
        ok: true,
        result: `wrote ${path} (${code.length} chars)`,
        events: [
          {
            type: "file",
            path,
            action,
            status: "done",
            phaseId,
            language,
            code,
            linesDelta: delta,
          },
        ],
      };
    }
    case "edit_file": {
      const path = String(args.path || "")
        .trim()
        .replace(/^\/+/, "");
      const oldStringRaw = String(args.old_string ?? "");
      const newString = sanitizeGeneratedCode(String(args.new_string ?? ""));
      const replaceAll = Boolean(args.replace_all);
      if (!path) {
        return { ok: false, result: "edit_file.path required", events: [] };
      }
      if (isHostOwnedPreviewPath(path)) {
        return {
          ok: false,
          result: `Do not edit "${path}" — host-owned preview tooling. Style via app/globals.css with @import "tailwindcss" + CSS variables.`,
          events: [],
        };
      }
      if (!oldStringRaw) {
        return {
          ok: false,
          result: "edit_file.old_string required (exact text from the current file)",
          events: [],
        };
      }

      // Break infinite old_string-not-found loops — force full rewrite
      if (
        state.editFailPath === path &&
        state.editFailStreak >= 2
      ) {
        const existingBlocked = state.files.get(path);
        return {
          ok: false,
          result: [
            `STOP. edit_file has failed ${state.editFailStreak} times on "${path}".`,
            `Do NOT call edit_file again for this path.`,
            `Call write_file with path="${path}" and the COMPLETE updated file contents.`,
            existingBlocked?.code
              ? `Current file (${existingBlocked.code.length} chars) — rewrite from this:\n\`\`\`\n${existingBlocked.code.slice(0, 2500)}\n\`\`\``
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
          events: [],
        };
      }

      const existing = state.files.get(path);
      if (!existing || existing.isImage) {
        return {
          ok: false,
          result: `edit_file: "${path}" is not loaded. Use write_file with the full file contents.`,
          events: [],
        };
      }

      const code = normalizeNewlines(existing.code);
      const oldString = normalizeNewlines(oldStringRaw);
      const matches = code.split(oldString).length - 1;
      if (matches === 0) {
        if (state.editFailPath === path) {
          state.editFailStreak += 1;
        } else {
          state.editFailPath = path;
          state.editFailStreak = 1;
        }

        const head = code.slice(0, 1800);
        if (state.editFailStreak >= 2) {
          return {
            ok: false,
            result: [
              `edit_file old_string not found again on "${path}".`,
              `STOP retrying edit_file. Call write_file now with the FULL updated file.`,
              `Current file starts with:\n\`\`\`\n${head}\n\`\`\``,
            ].join("\n"),
            events: [],
          };
        }
        return {
          ok: false,
          result: [
            `edit_file: old_string not found in "${path}".`,
            `Retry ONCE with an exact shorter unique snippet, or prefer write_file for the whole file.`,
            `File head:\n\`\`\`\n${head}\n\`\`\``,
          ].join("\n"),
          events: [],
        };
      }
      if (matches > 1 && !replaceAll) {
        return {
          ok: false,
          result: `edit_file: old_string matched ${matches} times. Make old_string more unique, or set replace_all=true.`,
          events: [],
        };
      }
      const nextCode = finalizeSourceCode(
        path,
        replaceAll
          ? code.split(oldString).join(newString)
          : code.replace(oldString, newString),
      );
      const language = existing.language || "tsx";
      const delta = linesDelta(existing.code, nextCode);
      const phaseId = phaseIdFromArgs(state, args);
      state.files.set(path, { ...existing, code: nextCode, language });
      state.deleted = state.deleted.filter((p) => p !== path);
      state.editFailStreak = 0;
      state.editFailPath = "";
      upsertPhaseFile(state, {
        path,
        action: "update",
        status: "done",
        language,
        linesDelta: delta,
      });
      return {
        ok: true,
        result: `edited ${path} (${matches} replacement${matches === 1 ? "" : "s"})`,
        events: [
          {
            type: "file",
            path,
            action: "update",
            status: "done",
            phaseId,
            language,
            code: nextCode,
            linesDelta: delta,
          },
        ],
      };
    }
    case "generate_image": {
      const query = String(args.query || "").trim();
      if (!query) {
        return {
          ok: false,
          result: "generate_image.query required",
          events: [],
        };
      }
      const aspect = args.aspect ? String(args.aspect) : undefined;
      const caption = args.caption ? String(args.caption).trim() : undefined;
      const kindRaw = String(args.kind || "").toLowerCase();
      const kind: "logo" | "illustration" | "photo" =
        kindRaw === "logo" || kindRaw === "illustration"
          ? kindRaw
          : /logo|wordmark|monogram|brand mark/i.test(query)
            ? "logo"
            : "photo";

      try {
        const { generateImagenImage } = await import("@/lib/gemini-image");
        const { saveImage, toDataUrl } = await import("@/lib/image-store");
        const bytes = await generateImagenImage(query, {
          aspectHint: aspect || (kind === "logo" ? "1:1" : undefined),
          kind,
        });
        const stored = await saveImage({
          query,
          mimeType: bytes.mimeType,
          base64: bytes.base64,
          salt: `chat:${kind}:${aspect || ""}:`,
        });
        const url = `/api/images/${stored._id}`;
        const dataUrl = toDataUrl(stored);
        const part = {
          type: "generated_image" as const,
          id: stored._id,
          url,
          dataUrl,
          query,
          kind,
          caption,
        };
        state.timeline.push(part);
        return {
          ok: true,
          result: [
            `CHAT_IMAGE_URL=${url}`,
            `kind=${kind}`,
            "Image is shown in chat. Do not start a project unless the user asked to build a site/app.",
          ].join(" "),
          events: [
            {
              type: "chat_image",
              id: stored._id,
              url,
              dataUrl,
              query,
              kind,
              caption,
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          result: `Image generation failed: ${msg.slice(0, 280)}`,
          events: [],
        };
      }
    }
    case "write_image": {
      const path = String(args.path || "")
        .trim()
        .replace(/^\/+/, "");
      const query = String(args.query || "").trim();
      if (!path || !query) {
        return {
          ok: false,
          result: "write_image.path and query required",
          events: [],
        };
      }
      const aspect = args.aspect ? String(args.aspect) : undefined;
      const kindRaw = String(args.kind || "").toLowerCase();
      const kind =
        kindRaw === "logo" || kindRaw === "illustration"
          ? kindRaw
          : /logo|wordmark|monogram/i.test(query) || /logo/i.test(path)
            ? ("logo" as const)
            : ("photo" as const);

      try {
        const { generateImagenImage } = await import("@/lib/gemini-image");
        const { saveImage, toDataUrl } = await import("@/lib/image-store");
        const bytes = await generateImagenImage(query, {
          aspectHint: aspect,
          kind,
        });
        const stored = await saveImage({
          query,
          mimeType: bytes.mimeType,
          base64: bytes.base64,
          path,
          salt: `${kind}:${aspect || ""}:`,
        });
        const apiUrl = `/api/images/${stored._id}`;
        const dataUrl = toDataUrl(stored);
        const publicPath = path.startsWith("public/")
          ? `/${path.slice("public/".length)}`
          : path.startsWith("/")
            ? path
            : `/${path}`;

        state.files.set(path, {
          path,
          code: apiUrl,
          language: "txt",
          query,
          isImage: true,
          aspect,
          imageUrl: apiUrl,
          imageDataUrl: dataUrl,
          imageKind: kind,
        });

        // Keep source on public path; preview injects bytes via dataUrl map
        const srcForCode = publicPath;
        const events: AgentStreamEvent[] = [
          {
            type: "image",
            path,
            query,
            aspect,
            url: apiUrl,
            dataUrl,
            kind,
          },
        ];
        const variants = [
          publicPath,
          path,
          path.replace(/^public\//, "/"),
          `/${path.replace(/^public\//, "")}`,
        ];
        const phaseId = phaseIdFromArgs(state, args);
        for (const [filePath, file] of state.files) {
          if (file.isImage || !file.code) continue;
          let code = file.code;
          let changed = false;
          for (const v of variants) {
            if (code.includes(`"${v}"`) || code.includes(`'${v}'`)) {
              code = code.split(`"${v}"`).join(`"${srcForCode}"`);
              code = code.split(`'${v}'`).join(`'${srcForCode}'`);
              changed = true;
            }
          }
          if (changed) {
            state.files.set(filePath, { ...file, code });
            const delta = linesDelta(file.code, code);
            upsertPhaseFile(state, {
              path: filePath,
              action: "update",
              status: "done",
              language: file.language,
              linesDelta: delta,
            });
            events.push({
              type: "file",
              path: filePath,
              action: "update",
              status: "done",
              phaseId,
              language: file.language,
              code,
              linesDelta: delta,
            });
          }
        }

        return {
          ok: true,
          result: [
            `IMAGE_SRC=${srcForCode}`,
            `API_URL=${apiUrl}`,
            `kind=${kind}`,
            `Use IMAGE_SRC in <img src="${srcForCode}"> and CSS url("${srcForCode}").`,
            "Generated image asset — do not use placeholders.",
          ].join(" "),
          events,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          result: `Image generation failed: ${msg.slice(0, 280)}. Retry write_image once with a clearer, more specific query. Do not invent a URL or use a placeholder.`,
          events: [],
        };
      }
    }
    case "delete_file": {
      const path = String(args.path || "")
        .trim()
        .replace(/^\/+/, "");
      if (!path) {
        return { ok: false, result: "delete_file.path required", events: [] };
      }
      const before = state.files.get(path)?.code;
      const phaseId = phaseIdFromArgs(state, args);
      state.files.delete(path);
      if (!state.deleted.includes(path)) state.deleted.push(path);
      const delta = before ? -linesDelta(undefined, before) : 0;
      upsertPhaseFile(state, {
        path,
        action: "delete",
        status: "done",
        linesDelta: delta,
      });
      return {
        ok: true,
        result: `deleted ${path}`,
        events: [
          { type: "delete", path },
          {
            type: "file",
            path,
            action: "delete",
            status: "done",
            phaseId,
            linesDelta: delta,
          },
        ],
      };
    }
    case "install_package": {
      const checked = assertInstallablePackage(
        String(args.name || ""),
        args.version != null ? String(args.version) : null,
      );
      if (!checked.ok) {
        return { ok: false, result: checked.error, events: [] };
      }
      const { name: pkgName, version } = checked;
      const phaseId = phaseIdFromArgs(state, args);
      state.packages.set(pkgName, version);
      const detail = `${pkgName}@${version}`;
      upsertPhaseCommand(state, {
        name: `npm i ${pkgName}`,
        status: "done",
        detail,
      });
      return {
        ok: true,
        result: `install ${pkgName}@${version} — import it in code next`,
        events: [
          { type: "package", name: pkgName, version },
          {
            type: "command",
            name: `npm i ${pkgName}`,
            status: "done",
            phaseId,
            detail,
          },
        ],
      };
    }
    case "message_user": {
      const text = sanitizeVisibleReply(String(args.text || "").trim());
      if (!text) {
        return { ok: false, result: "message_user.text required", events: [] };
      }
      // Builds use phase + finish.summary; message_user is for Q&A / short chat
      state.texts.push(text);
      state.timeline.push({ type: "text", text });
      return {
        ok: true,
        result: "ok",
        events: [{ type: "text", text }],
      };
    }
    case "suggest_actions": {
      const raw = Array.isArray(args.actions) ? args.actions : [];
      const actions = raw
        .map((a) => {
          const item = a as { name?: string; description?: string };
          return {
            name: String(item.name || "").trim(),
            description: item.description
              ? String(item.description)
              : undefined,
          };
        })
        .filter((a) => a.name);
      const next = actions.slice(0, 7);
      const count = next.length;
      if (count < 6) {
        return {
          ok: false,
          result: `Need 6–7 follow-up actions (got ${count}). Call suggest_actions again with more advanced next steps — not unfinished first-turn work (e.g. for stores avoid suggesting Cart/PDP/Search).`,
          events: [],
        };
      }
      state.actions = next;
      return {
        ok: true,
        result: `${count} actions`,
        events: [{ type: "actions", actions: state.actions }],
      };
    }
    case "request_env_vars": {
      const vars = normalizeEnvVarSpecs(args.vars);
      if (!vars.length) {
        return {
          ok: false,
          result:
            "request_env_vars.vars required — include at least the DB URL and auth/secret keys this backend uses",
          events: [],
        };
      }
      const title =
        String(args.title || "").trim() || "Environment variables";
      const description = String(args.description || "").trim() || undefined;
      const database = String(args.database || "").trim() || undefined;
      const id = nanoid(10);
      const localPath = envLocalPath();
      const examplePath = envExamplePath();
      const envBody = buildEnvFileContent(vars, {
        title: database
          ? `${title} (${database})`
          : title,
      });
      const exampleBody = buildEnvFileContent(vars, {
        title: "Example only — copy to .env.local and fill real values",
      });

      const phaseId = phaseIdFromArgs(state, args);
      for (const [path, code] of [
        [localPath, envBody],
        [examplePath, exampleBody],
      ] as const) {
        const existed = state.files.has(path);
        const before = state.files.get(path)?.code;
        const action: BuildFileAction = inferFileAction(existed);
        const delta = linesDelta(before, code);
        state.files.set(path, { path, code, language: "bash" });
        state.deleted = state.deleted.filter((p) => p !== path);
        upsertPhaseFile(state, {
          path,
          action,
          status: "done",
          language: "bash",
          linesDelta: delta,
        });
      }

      const part: EnvRequestPart = {
        type: "env_request",
        id,
        title,
        description,
        database,
        vars,
        status: "pending",
      };
      state.timeline.push(part);
      state.envRequested = true;

      return {
        ok: true,
        result: [
          `Wrote ${localPath} + ${examplePath}. Environment modal opened for the user.`,
          "Continue building with process.env.* — user will paste values in the modal.",
          "Do not invent real secrets. Do not block waiting for the user.",
        ].join(" "),
        events: [
          {
            type: "file",
            path: localPath,
            action: inferFileAction(false),
            status: "done",
            phaseId,
            language: "bash",
            code: envBody,
            linesDelta: linesDelta(undefined, envBody),
          },
          {
            type: "file",
            path: examplePath,
            action: inferFileAction(false),
            status: "done",
            phaseId,
            language: "bash",
            code: exampleBody,
            linesDelta: linesDelta(undefined, exampleBody),
          },
          {
            type: "env_request",
            id,
            title,
            description,
            database,
            vars,
            paths: [localPath, examplePath],
          },
        ],
      };
    }
    case "finish": {
      if (state.cloneRequiredTokens.length) {
        const blob = [...state.files.values()]
          .map((f) => f.code)
          .join("\n");
        const missing = state.cloneRequiredTokens.filter(
          (t) => t && !blob.includes(t),
        );
        const page = state.files.get("app/page.tsx");
        const pageTooThin = !page || page.code.length < 2800;
        if (missing.length || pageTooThin) {
          const reasons = [
            missing.length
              ? `still missing scraped asset URLs in code: ${missing.join(", ")}`
              : "",
            pageTooThin
              ? "app/page.tsx is too short — scroll the screenshot and build every section to the footer"
              : "",
          ]
            .filter(Boolean)
            .join("; ");
          return {
            ok: false,
            result: `Cannot finish yet — ${reasons}. Keep matching the screenshot, then finish again.`,
            events: [],
          };
        }
      }
      if (
        projectLooksLikeBackend(state.files.values()) &&
        !state.envRequested
      ) {
        return {
          ok: false,
          result:
            "Backend/API/DB detected but request_env_vars was never called. Call request_env_vars now with every secret this project needs (DB URL, auth secret, payment keys, etc.) including howToGet for each, then finish.",
          events: [],
        };
      }
      if (
        projectIsUiBuild(state.files) &&
        !projectHasLogoAsset(state.files)
      ) {
        return {
          ok: false,
          result:
            'Missing brand logo. In step 1 call write_image with kind "logo" (e.g. public/images/logo.png) — brief must match your fonts/colors/thesis — then reference IMAGE_SRC in site-header, layout, or the app shell. Do not use Lucide or text-only as the brand mark. Retry finish after wiring the logo.',
          events: [],
        };
      }
      const summary = String(args.summary || "").trim();
      const events: AgentStreamEvent[] = [];
      if (summary) {
        const lines = summaryLinesFromText(summary);
        if (lines.length) {
          state.texts.push(lines.join("\n"));
          state.timeline.push({ type: "summary", lines });
          events.push({ type: "summary", lines });
        }
      }
      state.finished = true;
      return {
        ok: true,
        result: "finished",
        events,
      };
    }
    default:
      return { ok: false, result: `Unknown tool: ${name}`, events: [] };
  }
}

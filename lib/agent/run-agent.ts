import {
  formatGeminiUserError,
  geminiKeyPoolStats,
  getGeminiKeys,
  hasAvailableGeminiKey,
  isCapacityMessage,
  isDailyQuotaMessage,
  isRateLimitMessage,
  isRetryableGeminiError,
  isRetryableGeminiMessage,
  markGeminiKeyHot,
  noteGeminiKeySuccess,
  parseGeminiStatus,
  pickGeminiKeyIndex,
  releaseGeminiKey,
  rotateGeminiKey,
} from "@/lib/gemini-keys";
import { getGeminiModel, toGeminiContents, type ChatTurn } from "@/lib/gemini";
import { formatThinkingText } from "@/lib/agent/format-thinking-text";
import {
  isReasoningLeakParagraph,
  sanitizeVisibleReply,
  splitReasoningLeak,
} from "@/lib/agent/sanitize-visible-reply";
import { buildDoneEvent, type AgentStreamEvent } from "@/lib/agent/events";
import {
  streamGeminiGenerateContent,
  sanitizeGeminiContents,
  type GeminiContent,
  type GeminiPart,
  type GeminiStreamResult,
} from "./gemini-stream";
import {
  createAgentState,
  executeAgentTool,
  isFigmaCanvasLockedPath,
  type AgentState,
} from "./tools";
import { sanitizeGeneratedCode } from "@/lib/agent/sanitize-code";
import { chunkForStream, emitPacedText } from "@/lib/agent/pace-text";
import {
  narrationForBuildStep,
  narrationForToolCall,
  stepHasBuildWork,
} from "@/lib/agent/build-narration";
import {
  ensurePhaseOnTimeline,
  upsertPhaseFile,
} from "@/lib/agent/build-timeline";
import { phaseLabelForFile } from "@/lib/agent/pretty-file-label";
import type { ProjectFile } from "@/lib/types";
import { filesHaveFigmaCanvas } from "@/lib/figma-canvas";

const MAX_STEPS = 100;

async function emitToolEvents(
  emit: (event: AgentStreamEvent) => void,
  events: AgentStreamEvent[],
) {
  for (const event of events) {
    if (event.type === "text" && event.text.trim()) {
      await emitPacedText(emit, event.text);
      continue;
    }
    // Stream reasoning into the UI panel; strip only duplicate full-text thinking shells
    if (event.type === "thinking" && event.text.trim() && event.durationSec == null) {
      emit({ type: "thinking", text: "" });
      continue;
    }
    emit(event);
  }
}

type StreamHandlers = {
  onTextDelta?: (text: string) => void;
  onThoughtDelta?: (text: string) => void;
  onFunctionCallStart?: (
    name: string,
    args: Record<string, unknown>,
  ) => void;
};

/** Agent always uses tools — native Gemini thinking + `think` tool both stay enabled. */
function shouldUseAgentTools(
  _turns: ChatTurn[],
  _existingFiles?: ProjectFile[] | null,
): boolean {
  return true;
}

async function emitThinkToolPlan(
  emit: (event: AgentStreamEvent) => void,
  text: string,
) {
  const body = text.trim();
  if (!body) return;
  emit({ type: "thinking", text: "" });
  for (const piece of chunkForStream(body, 48)) {
    emit({ type: "thinking_delta", text: piece });
  }
}

/** Google AI Studio only — sticky key until fail, then random cool key. */
async function callModelStream(
  contents: GeminiContent[],
  handlers: StreamHandlers,
  thinkingLevel?: string | null,
  useAgentTools = true,
  figmaBuild = false,
): Promise<GeminiStreamResult> {
  console.info(`[agent] provider=gemini model=${getGeminiModel()}`);

  let lastError = "All Gemini keys failed";
  let attempts = 0;
  const skipped = new Set<number>();
  /** Try many keys quickly — never sit on a shared-pool RPM wait. */
  const MAX_ATTEMPTS = 16;

  while (true) {
    const keys = getGeminiKeys();
    const stats = geminiKeyPoolStats("chat");

    if (attempts >= MAX_ATTEMPTS || skipped.size >= keys.length) {
      break;
    }

    if (!hasAvailableGeminiKey("chat")) {
      // No cool keys left (RPM skips + RPD parks). Don't block for ~40s — fail fast.
      throw new Error(
        formatGeminiUserError(
          "All keys cooling or out of daily quota — wait or retry after UTC midnight.",
        ),
      );
    }

    const keyIndex = pickGeminiKeyIndex("chat");
    if (skipped.has(keyIndex)) {
      releaseGeminiKey("chat", keyIndex);
      rotateGeminiKey("chat", keyIndex);
      attempts += 1;
      continue;
    }

    attempts += 1;
    console.info(
      `[agent] gemini key#${keyIndex + 1}/${stats.total} (cool=${stats.cool} hot=${stats.hot} attempt=${attempts})`,
    );

    try {
      const result = await streamGeminiGenerateContent(
        keys[keyIndex],
        contents,
        handlers,
        thinkingLevel,
        { useAgentTools, figmaBuild },
      );
      console.info(`[agent] gemini key#${keyIndex + 1} stream ok`);
      // Stick to this key; soft-rotate before ~15 RPM burns one free-tier key
      noteGeminiKeySuccess("chat", keyIndex);
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(
        `[agent] gemini key#${keyIndex + 1} fail`,
        lastError.slice(0, 160),
      );
      const status = parseGeminiStatus(lastError);
      const retryable =
        (status && isRetryableGeminiError(status, lastError)) ||
        isRetryableGeminiMessage(lastError);

      if (!retryable) throw new Error(formatGeminiUserError(lastError));

      skipped.add(keyIndex);

      if (isDailyQuotaMessage(lastError)) {
        // RPD burned — park until next UTC day only
        markGeminiKeyHot("chat", keyIndex, {
          daily: true,
          message: lastError,
        });
      } else if (isCapacityMessage(lastError)) {
        // 503 — short skip, random next key immediately
        markGeminiKeyHot("chat", keyIndex, { message: lastError });
      } else if (isRateLimitMessage(lastError)) {
        // RPM / RESOURCE_EXHAUSTED — short skip only, NEVER next-day unless RPD
        markGeminiKeyHot("chat", keyIndex, { ms: 55_000 });
      } else {
        markGeminiKeyHot("chat", keyIndex, { ms: 55_000 });
      }
      // Loop continues immediately on a random cool key
    } finally {
      releaseGeminiKey("chat", keyIndex);
    }
  }

  throw new Error(formatGeminiUserError(lastError));
}

function latestUserText(turns: ChatTurn[]): string {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === "user") return turns[i].content || "";
  }
  return "";
}

function figmaBlockedReply(turns: ChatTurn[]): string {
  const text = latestUserText(turns);
  if (/FIGMA_NEEDS_CONNECT:\s*1/i.test(text)) {
    return "I can't open that Figma file yet. Connect Figma from the account menu, then send the frame link again (it should include node-id).";
  }
  if (/FIGMA_TOKEN_INVALID:\s*1/i.test(text)) {
    return "Figma rejected the connected account token. In Figma → My apps, publish the Luca OAuth app (Private is fine — Draft tokens don't work). Then disconnect Figma in the account menu, connect again, and resend the frame link.";
  }
  if (/FIGMA_PLAN_REQUIRED:\s*1/i.test(text)) {
    return "Figma import is on Plus and Pro. Upgrade from Plans & billing, then send the frame link again.";
  }
  const handle =
    text.match(/logged in as (@[\w.-]+)/i)?.[1] ||
    text.match(/invite (@[\w.-]+)/i)?.[1];
  const who = handle || "the Figma account connected to Luca";
  return `Figma accepted the login but denied this file. Open it while logged in as ${who}, then Share → invite ${who} as Viewer. Link-only share is not enough. If your OAuth app is Private, the file has to live on that same Figma team. Then send the frame link again.`;
}

function seedStateFromTurns(turns: ChatTurn[], state: AgentState) {
  const latest = latestUserText(turns);
  const req = latest.match(/CLONE_REQUIRED_TOKENS:\s*(.+)/i);
  if (req?.[1]) {
    state.cloneRequiredTokens = req[1]
      .split("|")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 16);
    console.info(
      `[agent] clone required tokens: ${state.cloneRequiredTokens.join(", ")}`,
    );
  }
  if (
    /FIGMA_NEEDS_CONNECT:\s*1/i.test(latest) ||
    /FIGMA_ACCESS_DENIED:\s*1/i.test(latest) ||
    /FIGMA_TOKEN_INVALID:\s*1/i.test(latest) ||
    /FIGMA_PLAN_REQUIRED:\s*1/i.test(latest) ||
    /# FIGMA BLOCKED/i.test(latest)
  ) {
    state.figmaBlocked = true;
    state.figmaBuild = false;
  } else if (/FIGMA_BUILD:\s*1|FIGMA_CANVAS:\s*1|FIGMA_EDIT:\s*1|FIGMA_APP:\s*1|FIGMA_PAGE:\s*1/i.test(latest)) {
    state.figmaBuild = true;
    const proj = latest.match(/FIGMA_PROJECT:\s*([a-z0-9-]+)/i);
    if (proj?.[1]) state.projectId = proj[1];
  } else if (/figma\.com\/(design|file|proto)\//i.test(latest)) {
    // Link present but inspect never produced a readable brief — do not invent.
    state.figmaBlocked = true;
    state.figmaBuild = false;
  }

  for (let i = turns.length - 1; i >= 0; i--) {
    const m = turns[i];
    if (m.role !== "assistant") continue;
    const match = m.content.match(/\[project:([^\]]+)\]/i);
    if (match?.[1]) {
      state.projectId = match[1].trim();
      break;
    }
  }
}

function seedProjectFiles(state: AgentState, files?: ProjectFile[] | null) {
  if (!files?.length) return;
  for (const f of files) {
    const path = f.path.replace(/^\/+/, "");
    if (!path || !f.code) continue;
    state.files.set(path, {
      path,
      code: /\.(tsx?|jsx?|css|mjs|cjs)$/i.test(path)
        ? sanitizeGeneratedCode(f.code)
        : f.code,
      language:
        f.language ||
        (path.endsWith(".css")
          ? "css"
          : path.endsWith(".ts")
            ? "ts"
            : path.endsWith(".js")
              ? "js"
              : "tsx"),
    });
  }
  console.info(`[agent] seeded ${state.files.size} project file(s) for edit_file`);
  if (state.files.has(".env.local") || state.files.has(".env.example")) {
    state.envRequested = true;
  }
}

function seedPackages(
  state: AgentState,
  packages?: Record<string, string> | null,
) {
  if (!packages) return;
  for (const [name, version] of Object.entries(packages)) {
    if (name && version) state.packages.set(name, version);
  }
  if (state.packages.size) {
    console.info(
      `[agent] seeded ${state.packages.size} package(s): ${[...state.packages.keys()].join(", ")}`,
    );
  }
}

/** Safe to run concurrently — no cross-tool ordering dependency. */
const PARALLEL_SAFE_TOOLS = new Set([
  "write_file",
  "write_image",
  "generate_image",
  "install_package",
  "delete_file",
]);

type ToolCall = { name: string; args: Record<string, unknown>; id?: string };

/**
 * Run tool calls: batch parallel-safe tools with Promise.all, keep
 * phase / set_project / think / finish / message_user sequential for ordering.
 */
async function runToolCalls(
  functionCalls: ToolCall[],
  state: AgentState,
  emit: (event: AgentStreamEvent) => void,
  announcedToolSteps: Set<string>,
): Promise<GeminiPart[]> {
  const responseParts: GeminiPart[] = [];
  let pending: ToolCall[] = [];

  const announce = (call: ToolCall) => {
    const lateKey = `${call.name}:${String(call.args.path || call.args.id || call.args.name || "")}`;
    if (announcedToolSteps.has(lateKey)) return;
    announcedToolSteps.add(lateKey);

    if (call.name === "write_file" || call.name === "edit_file") {
      const path = String(call.args.path || "")
        .trim()
        .replace(/^\/+/, "");
      if (!path) return;
      const { phaseId, created } = ensurePhaseOnTimeline(
        state,
        phaseLabelForFile(
          path,
          call.name === "edit_file" || state.files.has(path)
            ? "update"
            : "create",
        ),
      );
      if (created) {
        const phase = state.timeline.find(
          (p) => p.type === "phase" && p.id === phaseId,
        );
        if (phase?.type === "phase") {
          emit({ type: "phase", id: phase.id, text: phase.text });
        }
      }
      const action =
        call.name === "edit_file" || state.files.has(path)
          ? ("update" as const)
          : ("create" as const);
      emit({
        type: "file",
        path,
        action,
        status: "in_progress",
        phaseId,
      });
      return;
    }

    if (call.name === "delete_file") {
      const path = String(call.args.path || "")
        .trim()
        .replace(/^\/+/, "");
      if (!path) return;
      const { phaseId, created } = ensurePhaseOnTimeline(
        state,
        phaseLabelForFile(path, "delete"),
      );
      if (created) {
        const phase = state.timeline.find(
          (p) => p.type === "phase" && p.id === phaseId,
        );
        if (phase?.type === "phase") {
          emit({ type: "phase", id: phase.id, text: phase.text });
        }
      }
      emit({
        type: "file",
        path,
        action: "delete",
        status: "in_progress",
        phaseId,
      });
      return;
    }

    if (call.name === "install_package") {
      const pkg = String(call.args.name || "").trim();
      if (!pkg) return;
      const { phaseId, created } = ensurePhaseOnTimeline(
        state,
        "Installing packages",
      );
      if (created) {
        const phase = state.timeline.find(
          (p) => p.type === "phase" && p.id === phaseId,
        );
        if (phase?.type === "phase") {
          emit({ type: "phase", id: phase.id, text: phase.text });
        }
      }
      emit({
        type: "command",
        name: `npm i ${pkg}`,
        status: "in_progress",
        phaseId,
        detail: pkg,
      });
    }
  };

  const flushParallel = async () => {
    if (!pending.length) return;
    const batch = pending;
    pending = [];
    for (const call of batch) announce(call);

    const outcomes = await Promise.all(
      batch.map(async (call) => {
        const outcome = await executeAgentTool(state, call.name, call.args);
        console.info(
          `[agent] tool ${call.name} -> ${outcome.result.slice(0, 100)}`,
        );
        return { call, outcome };
      }),
    );

    for (const { call, outcome } of outcomes) {
      await emitToolEvents(emit, outcome.events);
      responseParts.push({
        functionResponse: {
          name: call.name,
          response: {
            ok: outcome.ok,
            result: outcome.result,
          },
          id: call.id,
        },
      });
    }
  };

  for (const call of functionCalls) {
    if (PARALLEL_SAFE_TOOLS.has(call.name)) {
      pending.push(call);
      continue;
    }
    await flushParallel();
    announce(call);
    const outcome = await executeAgentTool(state, call.name, call.args);
    console.info(
      `[agent] tool ${call.name} -> ${outcome.result.slice(0, 100)}`,
    );
    await emitToolEvents(emit, outcome.events);
    responseParts.push({
      functionResponse: {
        name: call.name,
        response: {
          ok: outcome.ok,
          result: outcome.result,
        },
        id: call.id,
      },
    });
  }
  await flushParallel();
  return responseParts;
}

/** Streams NDJSON agent events (one JSON object per line). */
export async function streamAgentEvents(
  turns: ChatTurn[],
  projectIdHint?: string | null,
  existingFiles?: ProjectFile[] | null,
  existingPackages?: Record<string, string> | null,
  thinkingLevel?: string | null,
): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();
  const state = createAgentState(projectIdHint);
  seedStateFromTurns(turns, state);
  seedProjectFiles(state, existingFiles);
  seedPackages(state, existingPackages);
  if (!state.figmaBlocked && filesHaveFigmaCanvas(existingFiles)) {
    state.figmaBuild = true;
  }

  return new ReadableStream({
    async start(controller) {
      let closed = false;

      const emit = (event: AgentStreamEvent) => {
        if (closed) return;
        try {
          // Large padding forces chunked transfer flush (live v0-style UI)
          const line = `${JSON.stringify(event)}${" ".repeat(1024)}\n`;
          controller.enqueue(encoder.encode(line));
        } catch {
          closed = true;
        }
      };

      try {
        const turnStartedAt = Date.now();

        if (state.figmaBlocked) {
          const msg = figmaBlockedReply(turns);
          await emitPacedText(emit, msg);
          if (!state.texts.includes(msg)) state.texts.push(msg);
          if (
            !state.timeline.some((p) => p.type === "text" && p.text === msg)
          ) {
            state.timeline.push({ type: "text", text: msg });
          }
          state.finished = true;
          emit(buildDoneEvent(state));
          if (!closed) {
            controller.close();
            closed = true;
          }
          return;
        }

        const useAgentTools = shouldUseAgentTools(turns, existingFiles);

        const hasReasoningContent = () => {
          const row = state.timeline.find((p) => p.type === "thinking");
          const rowText =
            row?.type === "thinking" ? row.text?.trim() ?? "" : "";
          if (rowText) return true;
          return state.thinking.some((t) => t.trim().length > 0);
        };

        const ensureThinkingOnTimeline = () => {
          if (!hasReasoningContent()) {
            const idx = state.timeline.findIndex((p) => p.type === "thinking");
            if (idx >= 0) state.timeline.splice(idx, 1);
            return;
          }
          const durationSec = Math.max(
            1,
            Math.round((Date.now() - turnStartedAt) / 1000),
          );
          const idx = state.timeline.findIndex((p) => p.type === "thinking");
          if (idx >= 0) {
            const prev = state.timeline[idx];
            const prevSec =
              prev.type === "thinking" && prev.durationSec != null
                ? prev.durationSec
                : 0;
            if (prevSec <= 0) {
              const prevText =
                prev.type === "thinking" ? prev.text : "";
              state.timeline[idx] = {
                type: "thinking",
                text: prevText,
                durationSec,
              };
              emit({ type: "thinking_done", durationSec });
            }
            return;
          }
          const fromState = state.thinking.join("\n\n").trim();
          state.timeline.unshift({
            type: "thinking",
            text: fromState,
            durationSec,
          });
          emit({ type: "thinking_done", durationSec });
        };

        // Immediate UI shell while Mongo→Gemini connect (builds only)
        if (useAgentTools) {
          emit({ type: "thinking", text: "" });
        }

        const baseContents = sanitizeGeminiContents(
          (await toGeminiContents(turns)) as GeminiContent[],
        );
        const contents: GeminiContent[] = [...baseContents];

        // Only surface a project chip when files already exist (edit turn).
        // Never emit a default "project" shell on greetings / Q&A — that shows
        // an empty "Waiting for files…" card. set_project / write_file emit later.
        if (
          state.figmaBuild &&
          existingFiles?.length &&
          !/FIGMA_EDIT:\s*1|FIGMA_APP:\s*1/i.test(latestUserText(turns))
        ) {
          emit({ type: "project", id: state.projectId || "project" });
          const latest = latestUserText(turns);
          const kind = latest.match(/FIGMA_KIND:\s*(\w+)/i)?.[1] || "home";
          const route =
            latest.match(/FIGMA_ROUTE:\s*(\S+)/i)?.[1] || "app/page.tsx";
          const addedPage = /FIGMA_PAGE:\s*1/i.test(latest);
          const { phaseId } = ensurePhaseOnTimeline(
            state,
            addedPage ? `Adding Figma ${kind} page` : "Building Figma canvas",
          );
          emit({
            type: "phase",
            id: phaseId,
            text: addedPage
              ? `Adding Figma ${kind} page`
              : "Building Figma canvas",
          });
          for (const f of existingFiles) {
            const path = f.path.replace(/^\/+/, "");
            if (
              addedPage &&
              /^(app\/page\.tsx|app\/layout\.tsx|app\/globals\.css|components\/site-life\.tsx)$/i.test(
                path,
              )
            ) {
              continue;
            }
            const language =
              f.language || (path.endsWith(".css") ? "css" : "tsx");
            upsertPhaseFile(state, {
              path,
              action: "create",
              status: "done",
              language,
            });
            emit({
              type: "file",
              path,
              action: "create",
              status: "done",
              phaseId,
              language,
              code: f.code,
            });
          }
          const msg = addedPage
            ? `Compiled this Figma frame as the ${kind} page (${route}). Home is unchanged.`
            : kind === "product"
              ? "Preview is the Figma product page. Home cards will open it once you paste the landing frame — or open /product from the preview."
              : "Preview is the Figma home canvas. Product cards open /product/[slug] from the catalog. Paste a product-detail frame to compile that page — it will not replace home.";
          state.texts.push(msg);
          state.timeline.push({ type: "text", text: msg });
          state.finished = true;
          ensureThinkingOnTimeline();
          emit(buildDoneEvent(state));
          if (!closed) {
            controller.close();
            closed = true;
          }
          return;
        } else if (existingFiles?.length && state.projectId) {
          emit({ type: "project", id: state.projectId });
        }

        const maxSteps = MAX_STEPS;
        for (let step = 0; step < maxSteps; step++) {
          state.currentPhaseId = "";
          let streamedText = "";
          let streamedThought = "";
          let textDeltaOpen = false;
          let thoughtDeltaOpen = false;
          let thoughtSealed = false;
          let thoughtStartedAt = 0;
          let stepNarrationEmitted = false;
          /** Hold first paragraph so meta-reasoning never streams into the chat bubble. */
          let textLeadPending = "";
          let textLeadChecked = false;
          /** Flash sometimes thinks → answers → thinks → rewrites. Replace text, don't concat. */
          let replaceTextOnNextDelta = false;
          const announcedToolSteps = new Set<string>();

          const emitAnswerTextDelta = (delta: string) => {
            if (!delta) return;
            streamedText += delta;
            if (!textDeltaOpen) {
              textDeltaOpen = true;
              stepNarrationEmitted = true;
              emit({ type: "text", text: "" });
            }
            for (const piece of chunkForStream(delta, 48)) {
              emit({ type: "text_delta", text: piece });
            }
          };

          const persistStepNarration = (line: string) => {
            const text = line.trim();
            if (!text || stepNarrationEmitted) return;
            stepNarrationEmitted = true;
            streamedText = streamedText || text;
            if (
              !state.timeline.some((p) => p.type === "text" && p.text === text)
            ) {
              state.timeline.push({ type: "text", text });
            }
            if (!state.texts.includes(text)) state.texts.push(text);
            if (!textDeltaOpen) {
              void emitPacedText(emit, text);
              textDeltaOpen = true;
            }
          };

          const emitThoughtTextDelta = (delta: string) => {
            if (!delta) return;
            streamedThought += delta;
            if (!thoughtDeltaOpen) {
              thoughtDeltaOpen = true;
              thoughtSealed = false;
              thoughtStartedAt = Date.now();
              emit({ type: "thinking", text: "" });
            }
            for (const piece of chunkForStream(delta, 48)) {
              emit({ type: "thinking_delta", text: piece });
            }
          };

          const resolveTextLeadBuffer = () => {
            if (textLeadChecked || !textLeadPending) return;
            textLeadChecked = true;
            const pending = textLeadPending;
            textLeadPending = "";

            const paraBreak = pending.search(/\n\n+/);
            if (paraBreak >= 0) {
              const first = pending.slice(0, paraBreak).trim();
              const rest = pending.slice(paraBreak).replace(/^\n+/, "");
              if (isReasoningLeakParagraph(first)) {
                emitThoughtTextDelta(first);
                if (rest.trim()) emitAnswerTextDelta(rest);
                return;
              }
            }

            const { leaked, visible } = splitReasoningLeak(pending);
            if (leaked) {
              emitThoughtTextDelta(leaked);
              if (visible) emitAnswerTextDelta(visible);
              return;
            }

            emitAnswerTextDelta(pending);
          };

          const sealThought = () => {
            if (!thoughtDeltaOpen) return;
            thoughtDeltaOpen = false;
            thoughtSealed = true;
            const elapsed = thoughtStartedAt
              ? Math.round((Date.now() - thoughtStartedAt) / 1000)
              : 0;
            const words = streamedThought.split(/\s+/).filter(Boolean).length;
            const durationSec = Math.max(
              1,
              Math.min(60, elapsed || Math.round(words / 40) || 1),
            );
            const thoughtBody = formatThinkingText(streamedThought.trim());
            if (thoughtBody) {
              state.thinking.push(thoughtBody);
            }
            const thinkIdx = state.timeline.findIndex(
              (p) => p.type === "thinking",
            );
            const appendText = (prev: string, chunk: string) =>
              prev && chunk ? `${prev}\n\n${chunk}` : prev + chunk;
            if (thinkIdx >= 0) {
              const prev = state.timeline[thinkIdx];
              const prevSec =
                prev.type === "thinking" ? prev.durationSec ?? 0 : 0;
              const prevText = prev.type === "thinking" ? prev.text : "";
              state.timeline[thinkIdx] = {
                type: "thinking",
                text: appendText(prevText, thoughtBody),
                durationSec: Math.max(1, prevSec + durationSec),
              };
            } else {
              state.timeline.push({
                type: "thinking",
                text: thoughtBody,
                durationSec,
              });
            }
            emit({ type: "thinking_done", durationSec });
            streamedThought = "";
          };

          // Live stream: duration-only thinking → text_delta (Q&A) → tools
          const { parts, text, thought, functionCalls } =
            await callModelStream(
              contents,
              {
                onTextDelta: (delta) => {
                  sealThought();
                  if (replaceTextOnNextDelta) {
                    replaceTextOnNextDelta = false;
                    streamedText = "";
                    textDeltaOpen = false;
                    textLeadPending = "";
                    textLeadChecked = false;
                  }
                  if (!textLeadChecked) {
                    textLeadPending += delta;
                    if (
                      textLeadPending.includes("\n\n") ||
                      textLeadPending.length >= 360
                    ) {
                      resolveTextLeadBuffer();
                    }
                    return;
                  }
                  emitAnswerTextDelta(delta);
                },
                onThoughtDelta: (delta) => {
                  if (textDeltaOpen || (thoughtSealed && !thoughtDeltaOpen)) {
                    if (textDeltaOpen) {
                      replaceTextOnNextDelta = true;
                      textDeltaOpen = false;
                    }
                    thoughtSealed = false;
                    thoughtDeltaOpen = false;
                    streamedThought = "";
                  }
                  streamedThought += delta;
                  if (!thoughtDeltaOpen) {
                    thoughtDeltaOpen = true;
                    thoughtSealed = false;
                    thoughtStartedAt = Date.now();
                    emit({ type: "thinking", text: "" });
                  }
                  for (const piece of chunkForStream(delta, 48)) {
                    emit({ type: "thinking_delta", text: piece });
                  }
                },
                onFunctionCallStart: (name, args) => {
                  sealThought();
                  if (!textLeadChecked && textLeadPending) {
                    resolveTextLeadBuffer();
                  }
                  if (
                    !stepNarrationEmitted &&
                    (name === "phase" ||
                      name === "write_file" ||
                      name === "edit_file" ||
                      name === "write_image" ||
                      name === "delete_file" ||
                      name === "install_package")
                  ) {
                    const existing = sanitizeVisibleReply(streamedText.trim());
                    if (existing) {
                      stepNarrationEmitted = true;
                    } else {
                      persistStepNarration(narrationForToolCall(name, args));
                    }
                  }
                  if (name === "think") {
                    void emitThinkToolPlan(
                      emit,
                      String(args.text || ""),
                    );
                  }
                  if (
                    name === "write_file" ||
                    name === "edit_file" ||
                    name === "delete_file"
                  ) {
                    const path = String(args.path || "")
                      .trim()
                      .replace(/^\/+/, "");
                    if (path) {
                      const action =
                        name === "delete_file"
                          ? ("delete" as const)
                          : name === "edit_file" || state.files.has(path)
                            ? ("update" as const)
                            : ("create" as const);
                      const { phaseId, created } = ensurePhaseOnTimeline(
                        state,
                        phaseLabelForFile(path, action),
                      );
                      if (created) {
                        const phase = state.timeline.find(
                          (p) => p.type === "phase" && p.id === phaseId,
                        );
                        if (phase?.type === "phase") {
                          emit({ type: "phase", id: phase.id, text: phase.text });
                        }
                      }
                      emit({
                        type: "file",
                        path,
                        action,
                        status: "in_progress",
                        phaseId,
                      });
                    }
                  }
                  const key = `${name}:${String(args.path || args.id || args.name || "")}`;
                  announcedToolSteps.add(key);
                },
              },
              thinkingLevel,
              useAgentTools,
              state.figmaBuild,
            );

          if (!thoughtSealed) {
            if (!streamedThought.trim() && thought.trim()) {
              streamedThought = thought.trim();
              emit({ type: "thinking", text: "" });
              for (const piece of chunkForStream(streamedThought, 48)) {
                emit({ type: "thinking_delta", text: piece });
              }
              thoughtDeltaOpen = true;
            }
            if (thoughtDeltaOpen || streamedThought.trim()) {
              sealThought();
            }
          }

          if (!textLeadChecked && textLeadPending) {
            resolveTextLeadBuffer();
          }

          if (!functionCalls.length) {
            let finalText = sanitizeVisibleReply(
              (streamedText || text).trim(),
            );
            if (finalText) {
              if (!state.texts.includes(finalText)) {
                state.texts.push(finalText);
              }
              if (!state.timeline.some(
                (p) => p.type === "text" && p.text === finalText,
              )) {
                state.timeline.push({ type: "text", text: finalText });
              }
              // Native stream missed deltas (buffered chunk) — still paint live
              if (!textDeltaOpen) {
                await emitPacedText(emit, finalText);
              }
            }

            // Persist think line even when the model returns no thought tokens (e.g. "Hi")
            ensureThinkingOnTimeline();
            state.finished = true;
            break;
          }

          // Tool-calling turn: always show 2-line narration before a file batch.
          {
            const narration = sanitizeVisibleReply(
              (streamedText || text).trim(),
            );
            if (narration) {
              if (
                !state.timeline.some(
                  (p) => p.type === "text" && p.text === narration,
                )
              ) {
                state.timeline.push({ type: "text", text: narration });
              }
              if (!state.texts.includes(narration)) {
                state.texts.push(narration);
              }
              if (!textDeltaOpen) {
                await emitPacedText(emit, narration);
                textDeltaOpen = true;
              }
              stepNarrationEmitted = true;
            } else if (stepHasBuildWork(functionCalls)) {
              persistStepNarration(narrationForBuildStep(functionCalls));
            }
          }

          contents.push({ role: "model", parts: parts as GeminiPart[] });

          const responseParts = await runToolCalls(
            functionCalls,
            state,
            emit,
            announcedToolSteps,
          );

          contents.push({ role: "user", parts: responseParts });

          // edit_file miss loop — force write_file instead of burning keys
          if (state.editFailStreak >= 2 && state.editFailPath) {
            if (state.figmaBuild && isFigmaCanvasLockedPath(state.editFailPath)) {
              contents.push({
                role: "user",
                parts: [
                  {
                    text: "SYSTEM: Stop editing app/page.tsx. The Figma home canvas is locked. write_file a new route if the user asked for a page, otherwise call finish now.",
                  },
                ],
              });
            } else {
              const stuckPath = state.editFailPath;
              const file = state.files.get(stuckPath);
              contents.push({
                role: "user",
                parts: [
                  {
                    text: [
                      `SYSTEM: Stop calling edit_file on "${stuckPath}".`,
                      `Call write_file with path="${stuckPath}" and the COMPLETE corrected file in one shot.`,
                      file?.code
                        ? `Current file contents:\n\`\`\`\n${file.code.slice(0, 4000)}\n\`\`\``
                        : "",
                    ]
                      .filter(Boolean)
                      .join("\n"),
                  },
                ],
              });
            }
          }

          if (state.finished) break;
        }

        if (!state.finished) state.finished = true;
        state.timeline = state.timeline.filter(
          (p) =>
            p.type !== "phase" ||
            p.files.some((f) => f.status === "done") ||
            p.commands.some((c) => c.status === "done"),
        );
        ensureThinkingOnTimeline();
        emit(buildDoneEvent(state));

        if (!closed) {
          controller.close();
          closed = true;
        }
      } catch (err) {
        console.error("[agent]", err);
        const msg = err instanceof Error ? err.message : "Agent failed";
        try {
          emit({ type: "error", message: msg });
          if (!closed) {
            controller.close();
            closed = true;
          }
        } catch {
          controller.error(err);
        }
      }
    },
  });
}

export type { AgentState };

/** @deprecated Use streamAgentEvents. */
export async function streamAgentAsMdx(
  turns: Parameters<typeof streamAgentEvents>[0],
  projectIdHint?: string | null,
  existingFiles?: ProjectFile[] | null,
  existingPackages?: Record<string, string> | null,
  thinkingLevel?: string | null,
): Promise<ReadableStream<Uint8Array>> {
  return streamAgentEvents(
    turns,
    projectIdHint,
    existingFiles,
    existingPackages,
    thinkingLevel,
  );
}

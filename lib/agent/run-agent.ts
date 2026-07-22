import {
  formatGeminiUserError,
  geminiKeyPoolStats,
  getGeminiKeys,
  hasAvailableGeminiKey,
  isCapacityMessage,
  isRateLimitMessage,
  isRetryableGeminiError,
  isRetryableGeminiMessage,
  markGeminiKeyHot,
  parseGeminiStatus,
  pickGeminiKeyIndex,
  releaseGeminiKey,
  rotateGeminiKey,
} from "@/lib/gemini-keys";
import { toGeminiContents, type ChatTurn } from "@/lib/gemini";
import { buildDoneEvent, type AgentStreamEvent } from "@/lib/agent/events";
import {
  streamGeminiGenerateContent,
  type GeminiContent,
  type GeminiPart,
  type GeminiStreamResult,
} from "./gemini-stream";
import { streamPuterGenerateContent } from "./puter-stream";
import {
  createAgentState,
  executeAgentTool,
  type AgentState,
} from "./tools";
import {
  storeSuiteStatus,
  wantsFullStore,
} from "@/lib/agent/store-suite";
import { sanitizeGeneratedCode } from "@/lib/agent/sanitize-code";
import { chunkForStream, emitPacedText } from "@/lib/agent/pace-text";
import { ensurePhaseOnTimeline } from "@/lib/agent/build-timeline";
import {
  describeAiProviderMode,
  getAiProviderMode,
  getPuterTokens,
  isPuterConfigured,
} from "@/lib/puter";
import type { ProjectFile } from "@/lib/types";

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
    // Never stream raw thinking text — duration-only events pass through
    if (event.type === "thinking" && event.text.trim()) {
      emit({
        type: "thinking",
        text: "",
        durationSec: event.durationSec,
      });
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

async function callGeminiStreamWithRotation(
  contents: GeminiContent[],
  handlers: StreamHandlers,
  thinkingLevel?: string | null,
): Promise<GeminiStreamResult> {
  let lastError = "All Gemini keys failed";
  let attempts = 0;
  let consecutiveCapacity = 0;
  const skipped = new Set<number>();
  /** Bail early on widespread 503 so Puter fallback can take over quickly. */
  const CAPACITY_BAIL = 8;

  while (true) {
    const keys = getGeminiKeys();
    const stats = geminiKeyPoolStats("chat");
    const maxAttempts = Math.max(1, keys.length);
    if (attempts >= maxAttempts || skipped.size >= keys.length) {
      break;
    }
    if (consecutiveCapacity >= CAPACITY_BAIL) {
      lastError = `Gemini model high-demand (503) on ${consecutiveCapacity} keys — trying Puter fallback`;
      console.warn(`[agent] ${lastError}`);
      break;
    }

    if (!hasAvailableGeminiKey("chat")) {
      throw new Error(
        formatGeminiUserError(
          `All Gemini API keys are rate-limited or out of daily quota (pool=${stats.total}, hot=${stats.hot}).`,
        ),
      );
    }

    const keyIndex = pickGeminiKeyIndex("chat");
    if (skipped.has(keyIndex)) {
      releaseGeminiKey("chat", keyIndex);
      rotateGeminiKey("chat");
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
      );
      console.info(`[agent] gemini key#${keyIndex + 1} stream ok`);
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
      if (isCapacityMessage(lastError)) {
        consecutiveCapacity += 1;
        markGeminiKeyHot("chat", keyIndex, { message: lastError });
      } else if (isRateLimitMessage(lastError)) {
        consecutiveCapacity = 0;
        markGeminiKeyHot("chat", keyIndex, { message: lastError });
      } else {
        consecutiveCapacity = 0;
        markGeminiKeyHot("chat", keyIndex, { ms: 55_000 });
      }
    } finally {
      releaseGeminiKey("chat", keyIndex);
    }
  }

  throw new Error(formatGeminiUserError(lastError));
}

async function callPuterStreamWithRotation(
  contents: GeminiContent[],
  handlers: StreamHandlers,
): Promise<GeminiStreamResult> {
  const tokens = getPuterTokens();
  if (!tokens.length) {
    throw new Error(
      "Puter is not configured. Add PUTER_AUTH_TOKEN from https://puter.com/dashboard",
    );
  }

  let lastError = "All Puter tokens failed";
  for (let i = 0; i < tokens.length; i++) {
    console.info(`[agent] puter token#${i + 1}/${tokens.length}`);
    try {
      const result = await streamPuterGenerateContent(
        tokens[i],
        contents,
        handlers,
      );
      console.info(`[agent] puter token#${i + 1} stream ok`);
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(
        `[agent] puter token#${i + 1} fail`,
        lastError.slice(0, 160),
      );
    }
  }
  throw new Error(
    lastError.length > 220 ? `${lastError.slice(0, 200)}…` : lastError,
  );
}

/** Provider selected by `AI_PROVIDER` in `.env.local` (restart dev after change). */
async function callModelStream(
  contents: GeminiContent[],
  handlers: StreamHandlers,
  thinkingLevel?: string | null,
): Promise<GeminiStreamResult> {
  const mode = getAiProviderMode();
  const puterOk = isPuterConfigured();
  console.info(`[agent] provider=${describeAiProviderMode(mode)}`);

  if (mode === "puter") {
    if (!puterOk) {
      throw new Error(
        "AI_PROVIDER=puter but PUTER_AUTH_TOKEN is missing. Add it in .env.local",
      );
    }
    return callPuterStreamWithRotation(contents, handlers);
  }

  if (mode === "gemini") {
    return callGeminiStreamWithRotation(contents, handlers, thinkingLevel);
  }

  if (mode === "puter-first") {
    if (!puterOk) {
      console.warn(
        "[agent] AI_PROVIDER=puter-first but no PUTER_AUTH_TOKEN — using Gemini only",
      );
      return callGeminiStreamWithRotation(contents, handlers, thinkingLevel);
    }
    try {
      return await callPuterStreamWithRotation(contents, handlers);
    } catch (puterErr) {
      console.warn(
        "[agent] Puter failed — falling back to Gemini",
        puterErr instanceof Error ? puterErr.message.slice(0, 120) : puterErr,
      );
      try {
        return await callGeminiStreamWithRotation(
          contents,
          handlers,
          thinkingLevel,
        );
      } catch (geminiErr) {
        const p =
          puterErr instanceof Error ? puterErr.message : String(puterErr);
        const g =
          geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
        throw new Error(`${p} | Gemini fallback also failed: ${g}`);
      }
    }
  }

  // auto: Gemini pool, then Puter fallback
  try {
    return await callGeminiStreamWithRotation(
      contents,
      handlers,
      thinkingLevel,
    );
  } catch (geminiErr) {
    if (!puterOk) throw geminiErr;
    console.warn(
      "[agent] gemini pool exhausted — falling back to Puter",
      geminiErr instanceof Error ? geminiErr.message.slice(0, 120) : geminiErr,
    );
    try {
      return await callPuterStreamWithRotation(contents, handlers);
    } catch (puterErr) {
      const g =
        geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
      const p =
        puterErr instanceof Error ? puterErr.message : String(puterErr);
      throw new Error(`${g} | Puter fallback also failed: ${p}`);
    }
  }
}

function seedStateFromTurns(turns: ChatTurn[], state: AgentState) {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === "user" && turns[i].content?.trim()) {
      if (wantsFullStore(turns[i].content)) {
        state.requireFullStore = true;
      }
      break;
    }
  }

  for (let i = turns.length - 1; i >= 0; i--) {
    const m = turns[i];
    if (m.role === "user") {
      const req = m.content.match(/CLONE_REQUIRED_TOKENS:\s*(.+)/i);
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
    }
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
        "Building project files",
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
        "Updating project files",
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
        const baseContents = (await toGeminiContents(turns)) as GeminiContent[];
        const contents: GeminiContent[] = [...baseContents];

        // Only surface a project chip when files already exist (edit turn).
        // Never emit a default "project" shell on greetings / Q&A — that shows
        // an empty "Waiting for files…" card. set_project / write_file emit later.
        if (existingFiles?.length && state.projectId) {
          emit({ type: "project", id: state.projectId });
        }

        for (let step = 0; step < MAX_STEPS; step++) {
          let streamedText = "";
          let streamedThought = "";
          let textDeltaOpen = false;
          let thoughtDeltaOpen = false;
          let thoughtSealed = false;
          let thoughtStartedAt = 0;
          /** Flash sometimes thinks → answers → thinks → rewrites. Replace text, don't concat. */
          let replaceTextOnNextDelta = false;
          const announcedToolSteps = new Set<string>();

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
            // Keep reasoning server-side only — client gets duration, never text
            if (streamedThought.trim()) {
              state.thinking.push(streamedThought.trim());
            }
            state.timeline.push({
              type: "thinking",
              text: "",
              durationSec,
            });
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
                  }
                  streamedText += delta;
                  if (!textDeltaOpen) {
                    textDeltaOpen = true;
                    emit({ type: "text", text: "" });
                  }
                  for (const piece of chunkForStream(delta, 48)) {
                    emit({ type: "text_delta", text: piece });
                  }
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
                    // Empty shell → "Thinking..." shimmer; no reasoning tokens
                    emit({ type: "thinking", text: "" });
                  }
                },
                onFunctionCallStart: (name, args) => {
                  sealThought();
                  // Progress announced in runToolCalls (phase / file / command)
                  const key = `${name}:${String(args.path || args.id || args.name || "")}`;
                  announcedToolSteps.add(key);
                },
              },
              thinkingLevel,
            );

          // If the turn was thought-only / tools with no text, seal now
          if (!thoughtSealed && (thoughtDeltaOpen || streamedThought.trim())) {
            if (!streamedThought.trim() && thought.trim()) {
              streamedThought = thought.trim();
            }
            sealThought();
          }

          if (!functionCalls.length) {
            // Ecommerce: model stopped mid-suite — keep writing (no lecture in chat)
            if (state.requireFullStore && state.files.size > 0) {
              const suite = storeSuiteStatus(state.files);
              if (!suite.ok) {
                // Do not surface premature "store is ready" copy while files are still missing
                emit({
                  type: "phase",
                  id: `continue-${state.phaseSeq}`,
                  text: suite.nextLabel || "Finishing remaining routes",
                });
                contents.push({ role: "model", parts: parts as GeminiPart[] });
                contents.push({
                  role: "user",
                  parts: [
                    {
                      text: [
                        "Continue building. Call phase once, then write_file for ALL of these missing routes in ONE response (full files, parallel):",
                        ...suite.writeNext.map((p) => `- ${p}`),
                        "Do not call finish until those paths exist. Do not quote this list to the user.",
                      ].join("\n"),
                    },
                  ],
                });
                continue;
              }
            }

            const finalText = (streamedText || text).trim();
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

            state.finished = true;
            break;
          }

          // Tool-calling turn: drop provisional narration — UI uses phase/file/command
          if (textDeltaOpen && streamedText.trim()) {
            // Intentionally not adding preamble text to the timeline
          }

          contents.push({ role: "model", parts: parts as GeminiPart[] });

          const responseParts = await runToolCalls(
            functionCalls,
            state,
            emit,
            announcedToolSteps,
          );

          contents.push({ role: "user", parts: responseParts });

          // Nudge when the model drips one tool per step (each step = 1 API round-trip)
          const writeCount = functionCalls.filter(
            (c) => c.name === "write_file" || c.name === "write_image",
          ).length;
          const installCount = functionCalls.filter(
            (c) => c.name === "install_package",
          ).length;
          const parallelCount = writeCount + installCount;
          if (
            !state.finished &&
            parallelCount > 0 &&
            parallelCount < 4 &&
            (state.requireFullStore || state.files.size < 12)
          ) {
            contents.push({
              role: "user",
              parts: [
                {
                  text: [
                    "SYSTEM SPEED: Call phase once with a short sentence, then 6–12 tools in parallel in ONE step:",
                    "- all remaining install_package together",
                    "- 4–10 write_file for core pages/components/lib",
                    "- write_image when needed",
                    "No per-file narration. No message_user mid-build.",
                  ].join(" "),
                },
              ],
            });
          }

          // edit_file miss loop — force write_file instead of burning keys
          if (state.editFailStreak >= 2 && state.editFailPath) {
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

          if (state.finished) break;
        }

        if (!state.finished) state.finished = true;
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

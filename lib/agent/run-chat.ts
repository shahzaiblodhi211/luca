import {
  agentStateToParts,
  parseAgentEventLines,
  type AgentStreamEvent,
} from "@/lib/agent/events";
import { streamAgentEvents } from "@/lib/agent/run-agent";
import {
  appendAssistantMessage,
  appendAttachmentsToLastUserMessage,
  appendUserMessage,
  getChat,
  setChatThinkingLevel,
} from "@/lib/chats";
import { resolveAttachmentMetas } from "@/lib/attachments";
import { buildTurnsWithProjectContext } from "@/lib/project-context";
import { parseThinkingLevel } from "@/lib/thinking-level";
import type {
  AssistantPart,
  BuildPhasePart,
  ProjectFile,
} from "@/lib/types";
import type { ImageJob } from "@/lib/resolve-images";

type Acc = {
  content: string;
  projectId: string | null;
  files: Map<string, ProjectFile>;
  packages: Map<string, string>;
  images: ImageJob[];
  deleted: string[];
  thinking: string[];
  texts: string[];
  actions: Array<{ name: string; description?: string }>;
  timeline: AssistantPart[];
  doneParts?: AssistantPart[];
};

function upsertLivePhase(
  timeline: AssistantPart[],
  id: string,
  text: string,
): void {
  const existing = timeline.find(
    (p): p is BuildPhasePart => p.type === "phase" && p.id === id,
  );
  if (existing) {
    existing.text = text;
    return;
  }
  timeline.push({ type: "phase", id, text, files: [], commands: [] });
}

function phaseFor(
  timeline: AssistantPart[],
  phaseId?: string,
): BuildPhasePart | null {
  if (phaseId) {
    const hit = timeline.find(
      (p): p is BuildPhasePart => p.type === "phase" && p.id === phaseId,
    );
    if (hit) return hit;
  }
  for (let i = timeline.length - 1; i >= 0; i--) {
    const p = timeline[i];
    if (p.type === "phase") return p;
  }
  return null;
}

function applyEventToAccumulator(event: AgentStreamEvent, acc: Acc) {
  switch (event.type) {
    case "clone_ref":
    case "ping":
    case "preview":
      break;
    case "thinking":
      // Duration-only — never store model reasoning text
      acc.timeline.push({
        type: "thinking",
        text: "",
        durationSec: event.durationSec,
      });
      break;
    case "thinking_delta":
      // Ignored — raw reasoning is not persisted
      break;
    case "thinking_done": {
      for (let i = acc.timeline.length - 1; i >= 0; i--) {
        if (acc.timeline[i].type === "thinking") {
          acc.timeline[i] = {
            type: "thinking",
            text: "",
            durationSec: event.durationSec,
          };
          break;
        }
      }
      break;
    }
    case "phase":
      upsertLivePhase(acc.timeline, event.id, event.text);
      break;
    case "file": {
      if (event.status === "done" && event.code != null && event.action !== "delete") {
        acc.files.set(event.path, {
          path: event.path,
          code: event.code,
          language: event.language,
        });
        acc.deleted = acc.deleted.filter((p) => p !== event.path);
      }
      if (event.action === "delete" && event.status === "done") {
        acc.files.delete(event.path);
        if (!acc.deleted.includes(event.path)) acc.deleted.push(event.path);
      }
      let phase = phaseFor(acc.timeline, event.phaseId);
      if (!phase) {
        const id = event.phaseId || `p-auto-${acc.timeline.length}`;
        upsertLivePhase(acc.timeline, id, "Building project files");
        phase = phaseFor(acc.timeline, id);
      }
      if (phase) {
        const idx = phase.files.findIndex((f) => f.path === event.path);
        const item = {
          path: event.path,
          action: event.action,
          status: event.status,
          language: event.language,
          linesDelta: event.linesDelta,
        };
        if (idx >= 0) phase.files[idx] = { ...phase.files[idx], ...item };
        else phase.files.push(item);
      }
      break;
    }
    case "command": {
      let phase = phaseFor(acc.timeline, event.phaseId);
      if (!phase) {
        const id = event.phaseId || `p-cmd-${acc.timeline.length}`;
        upsertLivePhase(acc.timeline, id, "Installing packages");
        phase = phaseFor(acc.timeline, id);
      }
      if (phase) {
        const idx = phase.commands.findIndex((c) => c.name === event.name);
        const item = {
          name: event.name,
          status: event.status,
          detail: event.detail,
        };
        if (idx >= 0) phase.commands[idx] = { ...phase.commands[idx], ...item };
        else phase.commands.push(item);
      }
      break;
    }
    case "summary":
      acc.timeline.push({ type: "summary", lines: event.lines });
      acc.texts = event.lines;
      acc.content = event.lines.join("\n");
      break;
    case "status":
      acc.timeline = [
        ...acc.timeline.filter((p) => p.type !== "status"),
        {
          type: "status",
          action: event.action,
          filesChanged: event.filesChanged,
          linesDelta: event.linesDelta,
        },
      ];
      break;
    case "error":
      acc.timeline.push({ type: "error", message: event.message });
      break;
    case "step":
      // Legacy — ignore noisy steps
      break;
    case "project":
      acc.projectId = event.id;
      break;
    case "image":
      acc.images = [
        ...acc.images.filter((i) => i.path !== event.path),
        {
          path: event.path,
          query: event.query,
          aspectHint: event.aspect,
          url: event.url,
        },
      ];
      break;
    case "delete":
      acc.files.delete(event.path);
      if (!acc.deleted.includes(event.path)) acc.deleted.push(event.path);
      break;
    case "package":
      acc.packages.set(event.name, event.version);
      break;
    case "text": {
      const last = acc.timeline[acc.timeline.length - 1];
      if (!event.text && last?.type === "text") {
        last.text = "";
      } else {
        acc.timeline.push({ type: "text", text: event.text });
      }
      if (event.text.trim()) {
        acc.texts = acc.timeline
          .filter(
            (p): p is Extract<typeof p, { type: "text" }> => p.type === "text",
          )
          .map((p) => p.text)
          .filter((t) => t.trim());
        acc.content = acc.texts.join("\n\n");
      }
      break;
    }
    case "text_delta": {
      const last = acc.timeline[acc.timeline.length - 1];
      if (last?.type === "text") {
        last.text += event.text;
      } else {
        acc.timeline.push({ type: "text", text: event.text });
      }
      const texts = acc.timeline
        .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
        .map((p) => p.text);
      acc.texts = texts;
      acc.content = texts.join("\n\n");
      break;
    }
    case "actions":
      acc.actions = event.actions;
      break;
    case "done":
      acc.projectId = event.projectId || acc.projectId;
      acc.content = event.content || acc.content;
      for (const f of event.files) acc.files.set(f.path, f);
      acc.images = event.images.map((i) => ({
        path: i.path,
        query: i.query,
        aspectHint: i.aspect,
        url: "url" in i ? (i as { url?: string }).url : undefined,
      }));
      acc.deleted = event.deleted;
      acc.actions = event.actions;
      acc.thinking = event.thinking;
      if (!acc.texts.length && event.content) {
        acc.texts = [event.content];
      }
      if (event.parts?.length) {
        acc.doneParts = event.parts;
      }
      if (event.packages) {
        for (const [name, version] of Object.entries(event.packages)) {
          acc.packages.set(name, version);
        }
      }
      break;
    default:
      break;
  }
}

function partsFromAcc(acc: Acc) {
  if (acc.doneParts?.length) return acc.doneParts;
  return agentStateToParts({
    projectId: acc.projectId || "project",
    thinking: acc.thinking,
    files: new Map(
      [...acc.files.values()].map((f) => [
        f.path,
        { path: f.path, code: f.code, language: f.language },
      ]),
    ),
    packages: acc.packages,
    deleted: acc.deleted,
    actions: acc.actions,
    texts: acc.texts,
    timeline: acc.timeline,
    currentPhaseId: "",
    phaseSeq: 1,
    finished: true,
    cloneRequiredTokens: [],
    requireFullStore: false,
    storeFinishRejects: 0,
    editFailStreak: 0,
    editFailPath: "",
  });
}

export type RunChatInput = {
  chatId: string;
  message: string;
  attachmentIds?: string[];
  isFirst?: boolean;
  thinkingLevel?: string;
};

/**
 * Shared chat generation: Mongo context → agent stream → persist assistant turn.
 * `onEvent` receives every AgentStreamEvent (Flight or NDJSON transport).
 */
export async function runChatGeneration(
  input: RunChatInput,
  onEvent: (event: AgentStreamEvent) => void,
): Promise<void> {
  const chatId = input.chatId?.trim();
  const message = input.message?.trim();
  if (!chatId || !message) {
    throw new Error("chatId and message required");
  }

  let chat = await getChat(chatId);
  if (!chat) throw new Error("Chat not found");

  const thinkingLevel = parseThinkingLevel(
    input.thinkingLevel ?? chat.thinkingLevel,
  );
  if (chat.thinkingLevel !== thinkingLevel) {
    await setChatThinkingLevel(chatId, thinkingLevel);
    chat = { ...chat, thinkingLevel };
  }

  const attachmentIds = input.attachmentIds ?? [];
  const attachments = attachmentIds.length
    ? await resolveAttachmentMetas(attachmentIds)
    : [];

  if (!input.isFirst) {
    await appendUserMessage(chatId, message, attachments);
    chat = (await getChat(chatId))!;
  } else if (attachments.length) {
    await appendAttachmentsToLastUserMessage(chatId, attachments);
    chat = (await getChat(chatId))!;
  }

  const { turns, cloneAttachments, cloneSourceUrl } =
    await buildTurnsWithProjectContext(chat);

  if (cloneAttachments?.length) {
    onEvent({
      type: "clone_ref",
      attachments: cloneAttachments,
      sourceUrl: cloneSourceUrl,
    });
  }

  const stream = await streamAgentEvents(
    turns,
    chat.projectId,
    chat.files,
    chat.packages ?? null,
    thinkingLevel,
  );

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const acc: Acc = {
    content: "",
    projectId: chat.projectId,
    files: new Map(chat.files.map((f) => [f.path, f])),
    packages: new Map(Object.entries(chat.packages ?? {})),
    images: [],
    deleted: [],
    thinking: [],
    texts: [],
    actions: [],
    timeline: [],
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseAgentEventLines(buffer);
      buffer = rest;
      for (const event of events) {
        applyEventToAccumulator(event, acc);
        onEvent(event);
      }
    }
    if (buffer.trim()) {
      const { events } = parseAgentEventLines(`${buffer}\n`);
      for (const event of events) {
        applyEventToAccumulator(event, acc);
        onEvent(event);
      }
    }
  } finally {
    reader.releaseLock();
  }

  const parts = partsFromAcc(acc);
  await appendAssistantMessage(chatId, {
    content: acc.content,
    parts,
    projectId: acc.projectId,
    files: [...acc.files.values()],
    packages: Object.fromEntries(acc.packages),
    imageJobs: acc.images,
    deleted: acc.deleted,
  });
}

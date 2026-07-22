import type { ChatAttachment, ChatDoc, ChatMessage, ProjectFile } from "./types";
import type { ChatTurn } from "./gemini";
import {
  enrichTextWithUrlInspections,
  extractUrls,
  wantsCloneOrInspect,
} from "./inspect-url";
import { saveAttachment } from "./attachments";

const EDIT_RULES = `
# Editing rules (mandatory)
- The CURRENT PROJECT FILES below are the source of truth.
- Small tweaks (copy, color, one control): use edit_file with exact old_string → new_string. Do NOT rewrite the whole file.
- NEW feature/page asks (auth, dashboard, settings, etc.): expand to the FULL related surface in this turn (routes, validation, toasts, loading) — do not leave stubs.
- When adding a section into an existing page: prefer edit_file insert; keep every other section.
- Use write_file for brand-new routes/components that belong to the feature.
- Only remove or rewrite existing UI if the user explicitly asks to replace/remove it.
- Reuse the same project id via set_project.
`.trim();

export function formatProjectFiles(
  files: ProjectFile[],
  projectId: string | null,
  packages?: Record<string, string> | null,
): string {
  if (!files.length) return "";

  const blocks = files
    .map((f) => {
      const lang = f.language || (f.path.endsWith(".css") ? "css" : "tsx");
      return `\`\`\`${lang} file="${f.path}"\n${f.code}\n\`\`\``;
    })
    .join("\n\n");

  const pkgEntries = Object.entries(packages ?? {});
  const pkgBlock = pkgEntries.length
    ? [
        "",
        "INSTALLED PACKAGES (already available — import freely; use install_package for new ones):",
        ...pkgEntries.map(([name, version]) => `- ${name}@${version}`),
      ]
    : [];

  return [
    EDIT_RULES,
    "",
    `CURRENT PROJECT id="${projectId || "project"}"`,
    ...pkgBlock,
    "",
    "CURRENT PROJECT FILES:",
    "",
    blocks,
  ].join("\n");
}

function formatAssistantHistory(message: ChatMessage): string {
  if (message.content.trim()) {
    return message.content;
  }

  const texts =
    message.parts
      ?.filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
      .map((p) => p.text) ?? [];
  const summaries =
    message.parts
      ?.filter(
        (p): p is Extract<typeof p, { type: "summary" }> => p.type === "summary",
      )
      .flatMap((p) => p.lines) ?? [];
  const phases =
    message.parts?.filter(
      (p): p is Extract<typeof p, { type: "phase" }> => p.type === "phase",
    ) ?? [];
  const filePaths = phases.flatMap((p) => p.files.map((f) => f.path));
  const bits = [...texts, ...summaries];
  if (filePaths.length) {
    bits.push(`[files] ${[...new Set(filePaths)].join(", ")}`);
  }
  return bits.join("\n\n") || "(built UI with tools)";
}

function isAdditiveRequest(text: string): boolean {
  return /\b(add|append|include|insert|also|another|new section|extra|plus)\b/i.test(
    text,
  );
}

export type ProjectContextResult = {
  turns: ChatTurn[];
  /** Screenshots saved for chat UI (also sent to the model via inlineImages). */
  cloneAttachments: ChatAttachment[];
  cloneSourceUrl?: string;
};

async function persistCloneScreenshots(
  images: NonNullable<ChatTurn["inlineImages"]>,
  sourceUrl?: string,
): Promise<ChatAttachment[]> {
  const out: ChatAttachment[] = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    try {
      const buffer = Buffer.from(img.base64, "base64");
      const host = (() => {
        try {
          return sourceUrl ? new URL(sourceUrl).hostname : "page";
        } catch {
          return "page";
        }
      })();
      const saved = await saveAttachment({
        name: `clone-screenshot-${host}${images.length > 1 ? `-${i + 1}` : ""}.jpg`,
        mimeType: img.mimeType || "image/jpeg",
        size: buffer.byteLength,
        buffer,
        preserveAspect: true,
      });
      out.push(saved);
    } catch (err) {
      console.error("[project-context] failed to save clone screenshot", err);
    }
  }
  return out;
}

export async function buildTurnsWithProjectContext(
  chat: ChatDoc,
): Promise<ProjectContextResult> {
  const turns: ChatTurn[] = chat.messages.map((m) => ({
    role: m.role,
    content:
      m.role === "assistant" ? formatAssistantHistory(m) : m.content,
    attachments: m.attachments,
  }));

  if (!turns.length) return { turns, cloneAttachments: [] };

  const last = turns[turns.length - 1];
  if (last.role !== "user") return { turns, cloneAttachments: [] };

  let userText = last.content;
  let inlineImages: ChatTurn["inlineImages"] = [];
  let chatImages: ChatTurn["inlineImages"] = [];
  const urls = extractUrls(last.content);
  const cloneRequest = wantsCloneOrInspect(last.content) && urls.length > 0;
  const cloneSourceUrl = urls[0];

  if (urls.length) {
    try {
      const enriched = await enrichTextWithUrlInspections(userText);
      userText = enriched.text;
      inlineImages = enriched.inlineImages;
      chatImages = enriched.chatImages?.length
        ? enriched.chatImages
        : enriched.inlineImages;
    } catch (err) {
      console.error("[project-context] url inspect failed", err);
    }
  }

  let cloneAttachments: ChatAttachment[] = [];
  if (cloneRequest && chatImages?.length) {
    cloneAttachments = await persistCloneScreenshots(
      chatImages,
      cloneSourceUrl,
    );
  }

  const parts: string[] = [userText];

  if (isAdditiveRequest(last.content) && chat.files?.length && !cloneRequest) {
    parts.push(
      "IMPORTANT: This is an ADDITIVE request. Keep all existing sections/content and only add what was asked.",
    );
  }

  // Fresh clone: do NOT feed prior messy project files — they poison fidelity.
  if (cloneRequest) {
    parts.push(
      [
        "HOMEPAGE CLONE — screenshot-first:",
        "The FULL-PAGE SCREENSHOT is the ONLY design spec (layout, colors, buttons, spacing, every section).",
        "The brief ASSETS list is ONLY media URLs (images/videos/logo/icons) — plug them in where the screenshot shows media.",
        "Do NOT copy CSS classes/styles from the source site. Style with Tailwind to match the screenshot.",
        "Scroll the screenshot and build the entire page to the footer. Fresh project. Homepage only.",
        "think() by describing what you see in the screenshot, then header → footer → shell → page.",
      ].join(" "),
    );
  } else if (chat.files?.length) {
    parts.push(
      formatProjectFiles(chat.files, chat.projectId, chat.packages),
    );
  }

  if (last.attachments?.length || cloneAttachments.length) {
    parts.push(
      [
        "Images are attached with this message (user uploads and/or the captured page screenshot).",
        "For screenshots/mockups: perform a visual inspection like browser DevTools — layout regions, spacing, type scale, colors, icons, components — then recreate a pixel-faithful clone.",
        "Match structure and content; do not invent unrelated sections.",
      ].join(" "),
    );
  }

  if (
    /HOMEPAGE CLONE BRIEF|LOCKED DESIGN SYSTEM|site-header|PIXEL-FAITHFUL CLONE/i.test(
      userText,
    )
  ) {
    parts.push(
      [
        "HOMEPAGE CLONE ACTIVE — screenshot is the design; assets list is media URLs only.",
        "Build: site-header → site-footer → site-shell → app/page.tsx matching the FULL screenshot.",
      ].join(" "),
    );
  }

  turns[turns.length - 1] = {
    ...last,
    content: parts.filter(Boolean).join("\n\n"),
    // Keep model vision input; chat UI uses persisted cloneAttachments
    inlineImages: inlineImages?.length ? inlineImages : undefined,
    attachments: [
      ...(last.attachments ?? []),
      ...cloneAttachments.filter(
        (a) => !(last.attachments ?? []).some((e) => e.id === a.id),
      ),
    ],
  };

  return {
    turns,
    cloneAttachments,
    cloneSourceUrl: cloneRequest ? cloneSourceUrl : undefined,
  };
}

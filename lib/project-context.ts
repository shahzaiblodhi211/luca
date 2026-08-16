import type { ChatAttachment, ChatDoc, ChatMessage, ProjectFile } from "./types";
import type { ChatTurn } from "./gemini";
import { PREINSTALLED_PACKAGES } from "@/lib/sandpack-deps";
import {
  enrichTextWithUrlInspections,
  extractUrls,
  wantsCloneOrInspect,
} from "./inspect-url";
import { extractFigmaUrls } from "./figma";
import { filesHaveFigmaCanvas } from "./figma-canvas";
import { mergeFigmaProject, type FigmaFrameKind } from "./figma-frame";
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
  const preinstalled = Object.entries(PREINSTALLED_PACKAGES).map(
    ([name, version]) => `- ${name}@${version}`,
  );
  const extraInstalled = pkgEntries
    .filter(([name]) => !(name in PREINSTALLED_PACKAGES))
    .map(([name, version]) => `- ${name}@${version}`);
  const pkgBlock = [
    "",
    "PREINSTALLED PACKAGES (always available — import freely; never install_package these):",
    ...preinstalled,
    ...(extraInstalled.length
      ? [
          "",
          "ADDITIONAL PACKAGES (installed this session via install_package):",
          ...extraInstalled,
        ]
      : []),
  ];

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

function formatFigmaSkeletonFiles(
  files: ProjectFile[],
  projectId: string | null,
): string {
  const blocks = files
    .map((f) => {
      const lang = f.language || (f.path.endsWith(".css") ? "css" : "tsx");
      return `\`\`\`${lang} file="${f.path}"\n${f.code}\n\`\`\``;
    })
    .join("\n\n");
  return [
    "FIGMA DESKTOP SKELETON — these files are already in the project.",
    "Compile each Figma URL to FIGMA_ROUTE. A detail/product frame must NOT replace app/page.tsx.",
    "Do not change desktop width/height/left/top. Do not replace or shuffle asset URLs.",
    "Do not invent extra shop/about/journal pages unless that Figma frame or the user asked for them.",
    "New pages the user asks for: write_file new routes that reuse lib/catalog.ts. Galleries, tabs, qty must actually work.",
    "",
    `CURRENT PROJECT id="${projectId || "project"}"`,
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

function wantsFigmaAppSurface(text: string): boolean {
  return /\b(add|create|make|build|new|wire)\b.{0,80}\b(page|pages|route|shop|product|pdp|about|journal|gallery|tabs?|cart|checkout)\b|\b(product page|product view|product detail|shop page|new page)\b|\b(tabs?|galler(?:y|ies))\b.{0,40}\b(work|functional|click|open)\b|\bmake (the )?(tabs?|galler(?:y|ies)|product).{0,20}(work|functional)/i.test(
    text,
  );
}

export type ProjectContextResult = {
  turns: ChatTurn[];
  /** Screenshots saved for chat UI (also sent to the model via inlineImages). */
  cloneAttachments: ChatAttachment[];
  cloneSourceUrl?: string;
  figmaSkeleton?: ProjectFile[];
  figmaKind?: FigmaFrameKind;
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
        name: /^https?:\/\/([^/]*figma\.com)/i.test(sourceUrl || "")
          ? `clone-screenshot-figma${images.length > 1 ? `-${i + 1}` : ""}.jpg`
          : `clone-screenshot-${host}${images.length > 1 ? `-${i + 1}` : ""}.jpg`,
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
  opts?: {
    figmaAccessToken?: string | null;
    refreshFigmaToken?: () => Promise<string | null>;
    figmaHandle?: string;
    figmaPlanAllowed?: boolean;
    onFigmaInspectSuccess?: () => Promise<void>;
  },
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
  let figmaSkeleton: ProjectFile[] = [];
  let figmaKind: FigmaFrameKind | undefined;
  const urls = extractUrls(last.content);
  const figmaUrls = extractFigmaUrls(last.content);
  const cloneRequest = wantsCloneOrInspect(last.content) && urls.length > 0;
  const cloneSourceUrl = urls[0];
  const existingHome = filesHaveFigmaCanvas(chat.files);

  if (urls.length) {
    try {
      const enriched = await enrichTextWithUrlInspections(userText, {
        figmaAccessToken: opts?.figmaAccessToken,
        refreshFigmaToken: opts?.refreshFigmaToken,
        figmaHandle: opts?.figmaHandle,
        existingHome,
        figmaPlanAllowed: opts?.figmaPlanAllowed,
        onFigmaInspectSuccess: opts?.onFigmaInspectSuccess,
      });
      userText = enriched.text;
      inlineImages = enriched.inlineImages;
      chatImages = enriched.chatImages?.length
        ? enriched.chatImages
        : enriched.inlineImages;
      figmaKind = enriched.skeletonKind;
      if (enriched.skeletonFiles?.length) {
        figmaSkeleton = existingHome
          ? mergeFigmaProject(
              chat.files,
              enriched.skeletonFiles,
              enriched.skeletonKind || "page",
            )
          : enriched.skeletonFiles;
      }
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
  const figmaBlocked =
    /FIGMA_NEEDS_CONNECT:\s*1|FIGMA_ACCESS_DENIED:\s*1|FIGMA_TOKEN_INVALID:\s*1|FIGMA_PLAN_REQUIRED:\s*1|# FIGMA BLOCKED/i.test(
      userText,
    );
  const figmaReady = /FIGMA_BUILD:\s*1/i.test(userText) && !figmaBlocked;
  const figmaCanvasLive = filesHaveFigmaCanvas(chat.files);

  if (isAdditiveRequest(last.content) && chat.files?.length && !cloneRequest) {
    parts.push(
      "IMPORTANT: This is an ADDITIVE request. Keep all existing sections/content and only add what was asked.",
    );
  }

  // Fresh clone / Figma: do NOT feed prior messy project files — they poison fidelity.
  if (figmaBlocked || (figmaUrls.length > 0 && !figmaReady)) {
    parts.push(
      [
        "STOP — Figma is not readable. This is not a build.",
        "Do not call set_project, write_file, write_image, or invent a store.",
        "§5 commerce / theme invention is OFF.",
        "message_user one short line: invite the connected Figma account as Viewer on the file, then paste the frame link again.",
        "Then finish.",
      ].join(" "),
    );
  } else if (figmaReady) {
    if (figmaCanvasLive && figmaKind && figmaKind !== "home") {
      parts.push(
        [
          "FIGMA_PAGE: 1",
          `FIGMA_KIND: ${figmaKind}`,
          "Home canvas already exists. This Figma URL is an additional page.",
          "Do not replace app/page.tsx, layout, or globals.",
          "Keep every existing route. Overlay only the new page + catalog merge.",
        ].join("\n"),
      );
    } else {
      parts.push(
        [
          "FIGMA → CODE — pixel match the frame:",
          "Screenshot is vision-only. Do not put it in the page as an image or background.",
          "Build the LAYER TREE: flex when it says flex-row/flex-col (use listed gap/pad px); position:absolute + left/top from @x,y when it says absolute-children.",
          "NAV and BUTTONS are exact. Do not rename labels. LOGO asset is a visible img — never a hand-lettered SVG or sr-only.",
          "ASSETS: each URL is locked to one named layer and used once. BG = background-image. PHOTO/ICON/LOGO = <img> at the listed size. Do not shuffle or reuse a hero shot as a video thumb.",
          "No extra chrome (sticky/blur, borders, gradients, card boxes on cutouts) unless the tree lists it.",
          "Working page: keep the artboard boxes. Optional: nav click + button handlers. Do not stack siblings or change left/top/width/height.",
          "DESKTOP CANVAS is one absolute artboard. Do not invent a card grid, max-w-7xl, or extra shop/about pages.",
        ].join(" "),
      );
    }
    if (figmaSkeleton.length) {
      parts.push(formatFigmaSkeletonFiles(figmaSkeleton, chat.projectId));
    }
  } else if (figmaCanvasLive && !figmaUrls.length) {
    if (wantsFigmaAppSurface(last.content)) {
      parts.push(
        [
          "FIGMA_BUILD: 1",
          "FIGMA_APP: 1",
          "Home canvas is locked. The user asked for a real page or working control.",
          "write_file NEW routes/components only. Never rewrite app/page.tsx, app/layout.tsx, or app/globals.css.",
          "Products and posts live in lib/catalog.ts — reuse those records. Do not invent SKUs or Pexels photos.",
          "Wire nav/cards to the new routes. Product pages need a working gallery, tabs, qty, and add-to-cart.",
          "Match the canvas colors and type. Then finish.",
        ].join("\n"),
      );
    } else {
      parts.push(
        [
          "FIGMA_BUILD: 1",
          "FIGMA_EDIT: 1",
          "The preview is already the Figma canvas. Do a surgical edit for this request only.",
          "Keep every left/top/width/height, every img src, every font-family and color.",
          "edit_file the smallest snippet. Never write_file app/page.tsx, layout, or globals.css.",
          "If they asked for a new page, write_file that route from lib/catalog.ts instead of restacking home.",
          "Do not restack into sections, max-w-7xl, or a new card grid. Then finish.",
        ].join("\n"),
      );
    }
    parts.push(
      formatProjectFiles(chat.files, chat.projectId, chat.packages),
    );
  } else if (cloneRequest) {
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

  if (
    !figmaBlocked &&
    (last.attachments?.length || cloneAttachments.length)
  ) {
    parts.push(
      [
        "Images are attached with this message (user uploads and/or the captured page screenshot).",
        "For screenshots/mockups: perform a visual inspection like browser DevTools — layout regions, spacing, type scale, colors, icons, components — then recreate a pixel-faithful clone.",
        "Match structure and content; do not invent unrelated sections.",
      ].join(" "),
    );
  }

  if (
    !figmaBlocked &&
    !figmaReady &&
    /HOMEPAGE CLONE BRIEF|LOCKED DESIGN SYSTEM|PIXEL-FAITHFUL CLONE/i.test(
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
    figmaSkeleton: figmaSkeleton.length ? figmaSkeleton : undefined,
    figmaKind,
  };
}

export type Role = "user" | "assistant";

export type AttachmentKind = "image" | "text" | "file";

export type ChatAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
  url: string;
};

export type StoredAttachment = {
  _id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
  base64: string;
  textContent?: string;
  createdAt: Date;
};

export type AssistantAction = {
  name: string;
  description?: string;
};

export type AssistantStepIcon =
  | "file"
  | "image"
  | "search"
  | "design"
  | "package"
  | "default";

export type BuildFileAction = "create" | "update" | "delete";
export type BuildItemStatus = "in_progress" | "done";

export type BuildFileItem = {
  path: string;
  action: BuildFileAction;
  status: BuildItemStatus;
  language?: string;
  linesDelta?: number;
};

export type BuildCommandItem = {
  name: string;
  status: BuildItemStatus;
  detail?: string;
};

export type BuildPhasePart = {
  type: "phase";
  id: string;
  text: string;
  files: BuildFileItem[];
  commands: BuildCommandItem[];
};

export type AssistantPart =
  /** Duration-only collapsed line — never store raw model reasoning text. */
  | { type: "thinking"; text: string; durationSec?: number }
  | { type: "text"; text: string }
  | BuildPhasePart
  | { type: "summary"; lines: string[] }
  | {
      type: "status";
      action: string;
      filesChanged: number;
      linesDelta: number;
    }
  | { type: "error"; message: string }
  | { type: "preview"; ready: boolean }
  /** @deprecated Prefer phase + file/command items */
  | {
      type: "step";
      label: string;
      description?: string;
      status?: "complete" | "active" | "pending";
      icon?: AssistantStepIcon;
    }
  /** @deprecated Prefer phase groups */
  | {
      type: "project";
      id: string;
      files: Array<{ path: string; language?: string }>;
    }
  | { type: "actions"; actions: AssistantAction[] };

export type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  /** Structured agent UI parts (assistant messages). */
  parts?: AssistantPart[];
  attachments?: ChatAttachment[];
  createdAt: Date;
};

export type ProjectFile = {
  path: string;
  code: string;
  language?: string;
};

export type ChatImageRef = {
  id: string;
  path: string;
  query: string;
  mimeType: string;
  /** Live HTTPS URL (Pexels etc.) — prefer this over generating/storing bytes. */
  url?: string;
};

export type StoredImage = {
  _id: string;
  hash: string;
  query: string;
  mimeType: string;
  base64: string;
  path?: string;
  createdAt: Date;
};

export type ChatDoc = {
  _id: string;
  title: string;
  messages: ChatMessage[];
  projectId: string | null;
  files: ProjectFile[];
  /** Explicit npm packages installed via install_package (name → version). */
  packages?: Record<string, string>;
  images: ChatImageRef[];
  attachments: ChatAttachment[];
  /** Gemini thinking level for this chat (MINIMAL | LOW | MEDIUM | HIGH). */
  thinkingLevel?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ChatSummary = {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
};

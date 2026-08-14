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

/** One environment variable Luca asks the user to fill (backend / DB / auth). */
export type EnvVarSpec = {
  key: string;
  label: string;
  description?: string;
  /** Plain instructions: how to obtain this value (Atlas URL, Stripe dashboard, etc.). */
  howToGet?: string;
  placeholder?: string;
  required?: boolean;
  /** Mask input in the modal (default true for secrets). */
  secret?: boolean;
};

export type EnvRequestPart = {
  type: "env_request";
  id: string;
  title: string;
  description?: string;
  database?: string;
  vars: EnvVarSpec[];
  /** User submitted values (keys only tracked as filled for UI). */
  status: "pending" | "saved";
  savedKeys?: string[];
};

export type GeneratedImagePart = {
  type: "generated_image";
  id: string;
  url: string;
  /** Optional data URL for instant render while streaming. */
  dataUrl?: string;
  query: string;
  kind?: "photo" | "logo" | "illustration";
  caption?: string;
};

export type AssistantPart =
  /** Collapsed reasoning panel (Gemini thoughts + internal think tool). */
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
  | EnvRequestPart
  | GeneratedImagePart
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
  /** Served path e.g. `/api/images/{id}` (bytes live in Mongo). */
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
  /** Owner from Luca auth (`users._id`). Required for new chats. */
  userId: string;
  title: string;
  messages: ChatMessage[];
  projectId: string | null;
  files: ProjectFile[];
  /** Explicit npm packages installed via install_package (name → version). */
  packages?: Record<string, string>;
  images: ChatImageRef[];
  attachments: ChatAttachment[];
  /** Luca builder tier for this chat (spark | turbo | ultra). */
  lucaModelTier?: string;
  /** Gemini thinking level for this chat (MINIMAL | LOW | MEDIUM | HIGH). */
  thinkingLevel?: string;
  /** How many times Luca AI renamed the chat title (max 2). */
  titleAiUpdates?: number;
  /** First user message was only a greeting — allow one intent rename. */
  firstPromptGreeting?: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ChatSummary = {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  projectId?: string | null;
  /** Chat has generated code (files or project id). */
  hasProject?: boolean;
};

/** Code project built in a chat (has generated files or a project id). */
export type ProjectSummary = {
  id: string;
  title: string;
  projectId: string | null;
  fileCount: number;
  updatedAt: string;
  createdAt: string;
};

"use client";

import { ArrowUp, Loader2, Mic, Plus, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import { ShimmerBlock } from "@/components/ui/shimmer-block";
import type { ThinkingLevel } from "@/lib/thinking-level";
import { cn } from "@/lib/utils";
import type { ChatAttachment } from "@/lib/types";
import {
  DEFAULT_LIVE_VOICE_MODEL_ID,
  readStoredLiveVoiceModel,
  storeLiveVoiceModel,
} from "@/lib/live-voice-models";
import { LucaModelPicker } from "./luca-model-picker";
import { ComposerContextUsage } from "./composer-context-usage";
import { useAuthModal } from "@/components/auth/auth-context";
import { useAuthToast } from "@/components/auth/auth-toast";
import { usePlansModal } from "@/components/billing/plans-modal";
import type { PlanId } from "@/lib/billing/plans";
import { thinkingLevelForPlan } from "@/lib/billing/plans";
import { isOutOfSpendableCredits } from "@/lib/billing/types";
import {
  parseLucaModelTier,
  readStoredLucaModelTier,
  storeLucaModelTier,
  resolveLucaModelTier,
  type LucaModelTier,
} from "@/lib/luca-model-tier";
import { useVoiceDictation } from "./use-voice-dictation";
import { VoiceLiveModal } from "./voice-live-modal";
import { VoiceRecordingBar } from "./voice-recording-bar";
import { AnimatedBuildPlaceholder } from "./animated-build-placeholder";
import { ComposerPlusMenu } from "./composer-plus-menu";
import { figmaConnectUrl } from "./figma-connect-button";
import { extractFigmaUrls } from "@/lib/figma-url";
import { UpgradePlanBanner } from "@/components/billing/upgrade-plan-banner";

export type PromptSubmitPayload = {
  text: string;
  attachments: ChatAttachment[];
  thinkingLevel: ThinkingLevel;
  lucaModelTier: LucaModelTier;
};

type PendingFile = {
  localId: string;
  file: File;
  /** Local blob preview while uploading; swapped to server URL when ready. */
  previewUrl?: string;
  status: "uploading" | "ready" | "error";
  attachment?: ChatAttachment;
  error?: string;
};

async function uploadOne(file: File): Promise<ChatAttachment> {
  const { prepareFilesForUpload } = await import("@/lib/client-image");
  const [prepared] = await prepareFilesForUpload([file]);
  const form = new FormData();
  form.append("files", prepared ?? file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const data = (await res.json().catch(() => null)) as {
    attachments?: ChatAttachment[];
    error?: string;
  } | null;
  if (!res.ok) throw new Error(data?.error || "Upload failed");
  const saved = data?.attachments?.[0];
  if (!saved) throw new Error("Upload returned no attachment");
  return saved;
}

export function PromptForm({
  onSubmit,
  disabled,
  placeholder = "Ask Luca to build…",
  autoFocus,
  compact,
  lucaModelTier: lucaModelTierProp,
  onLucaModelTierChange,
  initialLucaModelTier,
  animatedBuildPlaceholder,
  streaming,
  onStop,
  showDisclaimer,
}: {
  onSubmit: (payload: PromptSubmitPayload) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
  /** Controlled builder model (chat page). */
  lucaModelTier?: LucaModelTier;
  onLucaModelTierChange?: (tier: LucaModelTier) => void;
  /** Initial tier when uncontrolled (home page). */
  initialLucaModelTier?: string | null;
  animatedBuildPlaceholder?: boolean;
  /** Luca is generating — show stop control. */
  streaming?: boolean;
  onStop?: () => void;
  /** Footer disclaimer under composer (chat page). */
  showDisclaimer?: boolean;
}) {
  const { billing, user, figmaOAuthConfigured, openAuth } = useAuthModal();
  const pathname = usePathname() || "/";
  const { showToast } = useAuthToast();
  const { openPlans } = usePlansModal();
  const planId = (billing?.planId ?? "free") as PlanId;
  const outOfCredits = isOutOfSpendableCredits(billing);

  useEffect(() => {
    if (outOfCredits) openPlans();
  }, [outOfCredits, openPlans]);

  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const controlled = lucaModelTierProp !== undefined;

  const [internalTier, setInternalTier] = useState<LucaModelTier>(() => {
    const parsed = parseLucaModelTier(initialLucaModelTier);
    if (parsed) return resolveLucaModelTier(planId, parsed);
    return readStoredLucaModelTier(planId);
  });

  const lucaModelTier = controlled ? lucaModelTierProp! : internalTier;

  const setLucaModelTier = (tier: LucaModelTier) => {
    const resolved = resolveLucaModelTier(planId, tier);
    storeLucaModelTier(resolved);
    if (controlled) {
      onLucaModelTierChange?.(resolved);
    } else {
      setInternalTier(resolved);
    }
  };
  const [attachOpen, setAttachOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [liveModelId, setLiveModelId] = useState(DEFAULT_LIVE_VOICE_MODEL_ID);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);
  const micLongPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micSuppressClickRef = useRef(false);
  const pendingFilesRef = useRef(pendingFiles);
  pendingFilesRef.current = pendingFiles;
  valueRef.current = value;

  const voice = useVoiceDictation({
    modelId: liveModelId,
    getBaseText: () => valueRef.current,
    onText: setValue,
    onError: (message) =>
      showToast({ type: "error", message }),
  });

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    setLiveModelId(readStoredLiveVoiceModel());
  }, []);

  useEffect(() => {
    if (controlled) return;
    setInternalTier((prev) =>
      resolveLucaModelTier(planId, readStoredLucaModelTier(planId) || prev),
    );
  }, [planId, controlled]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, compact ? 96 : 120)}px`;
  }, [value, compact]);

  useEffect(() => {
    return () => {
      for (const f of pendingFilesRef.current) {
        if (f.previewUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(f.previewUrl);
        }
      }
    };
  }, []);

  function patchPending(
    localId: string,
    patch: Partial<PendingFile> | ((item: PendingFile) => Partial<PendingFile>),
  ) {
    setPendingFiles((prev) =>
      prev.map((item) => {
        if (item.localId !== localId) return item;
        const next = typeof patch === "function" ? patch(item) : patch;
        return { ...item, ...next };
      }),
    );
  }

  function startUpload(localId: string, file: File) {
    void (async () => {
      try {
        const attachment = await uploadOne(file);
        patchPending(localId, (item) => {
          if (item.previewUrl?.startsWith("blob:")) {
            URL.revokeObjectURL(item.previewUrl);
          }
          return {
            status: "ready",
            attachment,
            previewUrl: attachment.url,
            error: undefined,
          };
        });
      } catch (err) {
        patchPending(localId, {
          status: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        });
      }
    })();
  }

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    if (!incoming.length) return;

    const slots = Math.max(0, 6 - pendingFilesRef.current.length);
    const toAdd = incoming.slice(0, slots);
    if (!toAdd.length) return;

    const created: PendingFile[] = toAdd.map((file) => ({
      localId: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
      file,
      previewUrl: file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined,
      status: "uploading" as const,
    }));

    setPendingFiles((prev) => [...prev, ...created]);
    for (const item of created) {
      startUpload(item.localId, item.file);
    }
  }

  function removePending(localId: string) {
    if (pending) return;
    setPendingFiles((prev) => {
      const target = prev.find((p) => p.localId === localId);
      if (target?.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((p) => p.localId !== localId);
    });
  }

  async function handleSubmit() {
    const trimmed = value.trim();
    const files = pendingFilesRef.current;
    if ((!trimmed && !files.length) || disabled || pending) return;
    if (outOfCredits) {
      openPlans();
      return;
    }
    if (files.some((f) => f.status === "uploading")) return;
    if (files.some((f) => f.status === "error")) {
      showToast({
        type: "error",
        message: "Remove failed uploads before sending",
      });
      return;
    }

    const attachments = files
      .map((f) => f.attachment)
      .filter((a): a is ChatAttachment => Boolean(a));

    setPending(true);
    setValue("");
    try {
      storeLucaModelTier(lucaModelTier);
      const submitPromise = onSubmit({
        text: trimmed,
        attachments,
        thinkingLevel: thinkingLevelForPlan(planId),
        lucaModelTier,
      });
      setPendingFiles([]);
      setPending(false);
      await submitPromise;
    } catch (err) {
      setPending(false);
      showToast({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to send",
      });
    }
  }

  const anyUploading = pendingFiles.some((f) => f.status === "uploading");
  const readyToSend =
    (value.trim().length > 0 ||
      (pendingFiles.length > 0 &&
        pendingFiles.every((f) => f.status === "ready"))) &&
    !disabled &&
    !pending &&
    !anyUploading &&
    !voice.recording;
  const canSend = readyToSend && !outOfCredits;

  const showBuildPlaceholder =
    Boolean(animatedBuildPlaceholder) &&
    !value &&
    !inputFocused &&
    !voice.recording &&
    !disabled &&
    !pending;

  return (
    <div className="w-full">
      <div
        className={cn(
          "relative w-full overflow-visible rounded-[22px] border bg-composer-bg shadow-[0_12px_40px_-18px_rgba(0,0,0,0.85)] transition-colors duration-150",
          inputFocused || dragOver
            ? "border-composer-border-focus"
            : "border-composer-border",
        )}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
      >
        <div className={compact ? "px-3 pb-2 pt-2.5" : "px-3.5 pb-2.5 pt-3"}>
        {extractFigmaUrls(value).length > 0 &&
        figmaOAuthConfigured &&
        billing &&
        !billing.figmaEnabled ? (
          <div className="mb-2.5 flex items-center justify-between gap-3 rounded-xl border border-zinc-700/80 bg-zinc-900/80 px-3 py-2">
            <p className="min-w-0 text-[12.5px] leading-snug text-zinc-300">
              Figma import is on Plus and Pro.
            </p>
            <a
              href="/billing"
              className="shrink-0 rounded-lg bg-zinc-100 px-2.5 py-1 text-[12px] font-medium text-zinc-950"
            >
              Upgrade
            </a>
          </div>
        ) : extractFigmaUrls(value).length > 0 &&
        figmaOAuthConfigured &&
        user?.figmaConnected ? (
          <div className="mb-2.5 rounded-xl border border-zinc-700/80 bg-zinc-900/80 px-3 py-2">
            <p className="text-[12.5px] leading-snug text-zinc-300">
              Paste a <span className="text-zinc-100">frame</span> link
              (node-id). Invite{" "}
              {user.figmaHandle ? (
                <span className="text-zinc-100">@{user.figmaHandle}</span>
              ) : (
                "the Figma account you connected"
              )}{" "}
              as a Viewer — “Anyone with the link” is not enough for Luca to
              read layers.
            </p>
          </div>
        ) : extractFigmaUrls(value).length > 0 &&
          figmaOAuthConfigured &&
          !user?.figmaConnected ? (
          <div className="mb-2.5 flex items-center justify-between gap-3 rounded-xl border border-zinc-700/80 bg-zinc-900/80 px-3 py-2">
            <p className="min-w-0 text-[12.5px] leading-snug text-zinc-300">
              Connect Figma so Luca can open this share link with your access.
            </p>
            {user ? (
              <a
                href={figmaConnectUrl(pathname)}
                className="shrink-0 rounded-lg bg-zinc-100 px-2.5 py-1 text-[12px] font-medium text-zinc-950"
              >
                Connect Figma
              </a>
            ) : (
              <button
                type="button"
                onClick={() => openAuth("login")}
                className="shrink-0 rounded-lg bg-zinc-100 px-2.5 py-1 text-[12px] font-medium text-zinc-950"
              >
                Sign in
              </button>
            )}
          </div>
        ) : null}
        {pendingFiles.length > 0 && (
          <Attachments variant="grid" className="mb-2.5 ml-0">
            {pendingFiles.map((item) => (
              <Attachment
                key={item.localId}
                data={{
                  id: item.localId,
                  type: "file",
                  url: item.previewUrl || item.attachment?.url || "",
                  mediaType:
                    item.attachment?.mimeType ||
                    item.file.type ||
                    "application/octet-stream",
                  filename: item.attachment?.name || item.file.name,
                }}
                onRemove={
                  pending || item.status === "uploading"
                    ? undefined
                    : () => removePending(item.localId)
                }
              >
                <AttachmentPreview />
                {item.status !== "uploading" && !pending ? (
                  <AttachmentRemove />
                ) : null}
                {item.status === "uploading" ? (
                  <div className="absolute inset-0 z-10 overflow-hidden rounded-[inherit]">
                    <ShimmerBlock className="h-full w-full opacity-80" />
                  </div>
                ) : null}
              </Attachment>
            ))}
          </Attachments>
        )}

        <div className="relative">
          {showBuildPlaceholder ? (
            <AnimatedBuildPlaceholder
              active
              className={cn(
                "pointer-events-none absolute left-0.5 top-0 block text-left text-[15px] leading-snug text-composer-muted",
                compact ? "min-h-[28px] py-0" : "min-h-[36px] py-0",
              )}
            />
          ) : null}
          <textarea
            ref={ref}
            value={value}
            disabled={disabled || pending || voice.recording}
            placeholder={animatedBuildPlaceholder ? " " : placeholder}
            rows={1}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files || []);
              if (files.length) {
                e.preventDefault();
                addFiles(files);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            className={cn(
              "relative w-full resize-none bg-transparent text-left text-[15px] leading-snug text-composer-fg outline-none",
              animatedBuildPlaceholder
                ? "placeholder:text-transparent"
                : "placeholder:text-composer-muted",
              compact ? "min-h-[28px] px-0.5" : "min-h-[36px] px-0.5",
            )}
          />
        </div>

        {voice.listening || voice.busy ? (
          <VoiceRecordingBar
            active={voice.listening && !voice.busy}
            analyser={voice.waveAnalyser}
            elapsedMs={voice.elapsedMs}
            maxMs={voice.maxMs}
            busy={voice.busy}
            onCancel={() => void voice.cancel()}
            onConfirm={() => void voice.confirm()}
          />
        ) : (
          <div className="mt-1.5 flex items-center justify-between gap-2 overflow-visible">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 overflow-visible">
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*,.txt,.md,.csv,.json,.js,.jsx,.ts,.tsx,.css,.html,.svg,.pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <div className="relative">
                <button
                  type="button"
                  disabled={disabled || pending || pendingFiles.length >= 6}
                  onClick={() => setAttachOpen((v) => !v)}
                  className={cn(
                    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-composer-icon transition-colors hover:bg-composer-icon-hover-bg hover:text-composer-icon-hover disabled:opacity-40",
                    attachOpen && "bg-composer-icon-hover-bg text-composer-icon-hover",
                  )}
                  title="Add"
                  aria-label="Add"
                  aria-expanded={attachOpen}
                >
                  <Plus className="h-5 w-5" strokeWidth={1.75} />
                </button>
                <ComposerPlusMenu
                  open={attachOpen}
                  onClose={() => setAttachOpen(false)}
                  figmaLocked={!billing?.figmaEnabled}
                  onUpload={() => fileRef.current?.click()}
                  onImportFigma={() => {
                    if (!user) {
                      openAuth("login");
                      return;
                    }
                    if (!billing?.figmaEnabled) {
                      openPlans();
                      return;
                    }
                    if (figmaOAuthConfigured && !user.figmaConnected) {
                      window.location.href = figmaConnectUrl(pathname);
                      return;
                    }
                    showToast({
                      type: "success",
                      message: "Paste a Figma file or frame link in the chat.",
                    });
                    ref.current?.focus();
                  }}
                />
              </div>
              <LucaModelPicker
                compact={compact}
                value={lucaModelTier}
                planId={planId}
                disabled={disabled || pending || voice.recording}
                onChange={(tier) => {
                  setLucaModelTier(tier);
                }}
                onUpgrade={() => openPlans()}
              />
              <ComposerContextUsage
                lucaModelTier={lucaModelTier}
                billing={billing}
                disabled={disabled || pending || voice.recording}
              />
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {!streaming ? (
                <button
                  type="button"
                  disabled={disabled || pending}
                  onPointerDown={() => {
                    micSuppressClickRef.current = false;
                    if (micLongPressRef.current) {
                      clearTimeout(micLongPressRef.current);
                    }
                    micLongPressRef.current = setTimeout(() => {
                      micSuppressClickRef.current = true;
                      setVoiceOpen(true);
                    }, 480);
                  }}
                  onPointerUp={() => {
                    if (micLongPressRef.current) {
                      clearTimeout(micLongPressRef.current);
                      micLongPressRef.current = null;
                    }
                  }}
                  onPointerLeave={() => {
                    if (micLongPressRef.current) {
                      clearTimeout(micLongPressRef.current);
                      micLongPressRef.current = null;
                    }
                  }}
                  onClick={() => {
                    if (micSuppressClickRef.current) {
                      micSuppressClickRef.current = false;
                      return;
                    }
                    void voice.start();
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-composer-icon transition-colors hover:bg-composer-icon-hover-bg hover:text-emerald-400 disabled:opacity-40"
                  title="Voice input (hold for model)"
                  aria-label="Start voice input"
                >
                  <Mic className="h-5 w-5" strokeWidth={1.75} />
                </button>
              ) : null}
              {streaming && onStop ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white transition-colors hover:bg-emerald-500 active:bg-emerald-700"
                  title="Stop generating"
                  aria-label="Stop generating"
                >
                  <Square className="h-3 w-3 fill-current" strokeWidth={0} />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!readyToSend}
                  onClick={() => {
                    if (outOfCredits) {
                      openPlans();
                      return;
                    }
                    void handleSubmit();
                  }}
                  className={cn(
                    "inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors",
                    canSend
                      ? "bg-emerald-600 text-white hover:bg-emerald-500 active:bg-emerald-700"
                      : "bg-composer-action-disabled text-composer-muted",
                    "disabled:cursor-not-allowed",
                  )}
                  aria-label="Send"
                >
                  {pending ? (
                    <Loader2 className="h-[18px] w-[18px] animate-spin" />
                  ) : (
                    <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.25} />
                  )}
                </button>
              )}
              {streaming && readyToSend ? (
                <button
                  type="button"
                  disabled={!readyToSend}
                  onClick={() => {
                    if (outOfCredits) {
                      openPlans();
                      return;
                    }
                    void handleSubmit();
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white transition-colors hover:bg-emerald-500 active:bg-emerald-700 disabled:cursor-not-allowed"
                  aria-label="Add to queue"
                >
                  {pending ? (
                    <Loader2 className="h-[18px] w-[18px] animate-spin" />
                  ) : (
                    <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.25} />
                  )}
                </button>
              ) : null}
            </div>
          </div>
        )}
        </div>
        <UpgradePlanBanner />
      </div>

      {showDisclaimer ? (
        <p
          className={cn(
            "px-2 text-center text-[11px] leading-snug text-[#717476]",
            compact ? "mt-2" : "mt-2.5",
          )}
        >
          Luca can make mistakes. Check important info.
        </p>
      ) : null}

      <VoiceLiveModal
        open={voiceOpen}
        selectedId={liveModelId}
        onClose={() => setVoiceOpen(false)}
        onSelect={(model) => {
          setLiveModelId(model.id);
          storeLiveVoiceModel(model.id);
          setVoiceOpen(false);
        }}
      />
    </div>
  );
}

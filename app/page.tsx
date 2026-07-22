"use client";

import { useRouter } from "next/navigation";
import { AppShell } from "@/components/chat/app-shell";
import {
  PromptForm,
  type PromptSubmitPayload,
} from "@/components/chat/prompt-form";
import { readStoredThinkingLevel } from "@/lib/thinking-level";

const SUGGESTIONS = [
  "Build a modern SaaS landing page with pricing",
  "Create a stopwatch component with start, pause, reset",
  "Make a dashboard with charts and a sidebar",
  "Design a login form with email and password",
];

export default function HomePage() {
  const router = useRouter();

  async function startChat(payload: PromptSubmitPayload) {
    const res = await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: payload.text,
        attachmentIds: payload.attachments.map((a) => a.id),
        thinkingLevel: payload.thinkingLevel,
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error || "Failed to create chat");
    }
    const data = (await res.json()) as { chat: { id: string } };
    router.push(`/c/${data.chat.id}?start=1`);
  }

  return (
    <AppShell>
      <div className="relative flex flex-1 flex-col items-center justify-center px-4">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(52,211,153,0.08),_transparent_50%),radial-gradient(ellipse_at_bottom,_rgba(113,113,122,0.12),_transparent_55%)]"
        />
        <div className="relative z-10 w-full max-w-2xl space-y-8 text-center">
          <div className="space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-xl font-bold text-zinc-900 shadow-lg shadow-emerald-500/10">
              L
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
              What can I help you build?
            </h1>
            <p className="text-sm text-zinc-400 sm:text-base">
              Luca AI by Luca Technology — upload screenshots or files, then describe what you want.
            </p>
          </div>

          <PromptForm autoFocus onSubmit={startChat} />

          <div className="flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() =>
                  void startChat({
                    text: s,
                    attachments: [],
                    thinkingLevel: readStoredThinkingLevel(),
                  })
                }
                className="rounded-full border border-zinc-800 bg-zinc-900/70 px-3 py-1.5 text-left text-xs text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

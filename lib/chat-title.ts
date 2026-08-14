import { getGeminiKeys } from "./gemini-keys";
import { titleFromPrompt } from "./utils";

const TITLE_MODEL =
  process.env.GEMINI_TITLE_MODEL?.trim() || "gemini-3.5-flash-lite";

const GREETING_ONLY =
  /^(hi|hello|hey|yo|sup|howdy|hiya|heya|greetings?|what'?s\s+up|whats\s+up|good\s+(morning|afternoon|evening|night))[\s!.,?]*$/i;

const GREETING_WITH_TAIL =
  /^(hi there|hello there|hey there|good to see you)[\s!.,?]*$/i;

/** Short hello / small talk — title stays friendly until the user states a goal. */
export function isGreetingOnly(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t || t.length > 96) return false;
  if (GREETING_ONLY.test(t) || GREETING_WITH_TAIL.test(t)) return true;
  const words = t.split(/\s+/);
  if (words.length <= 3 && /^(hi|hello|hey)\b/i.test(t)) return true;
  return false;
}

/** User stated what they want — allow the one-time rename after a greeting opener. */
export function isSubstantiveIntent(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t || t.length < 6) return false;
  if (isGreetingOnly(t)) return false;

  if (
    /\b(build|create|make|design|implement|develop|add|fix|clone|copy|landing|dashboard|app|website|page|component|api|auth|todo|saas|ecommerce|storefront|portfolio|blog|admin|panel|form|modal|chart|table)\b/i.test(
      t,
    )
  ) {
    return true;
  }

  if (/^https?:\/\//i.test(t)) return true;
  if (t.length >= 28) return true;
  if (/\?/.test(t) && t.split(/\s+/).length >= 5) return true;
  return false;
}

function sanitizeTitle(raw: string, max = 48): string {
  const cleaned = raw
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "New chat";
  return titleFromPrompt(cleaned, max);
}

async function generateTitleWithGemini(prompt: string): Promise<string | null> {
  const keys = getGeminiKeys();
  if (!keys.length) return null;

  for (const apiKey of keys) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${TITLE_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 32,
          },
        }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (text) return sanitizeTitle(text);
    } catch {
      continue;
    }
  }
  return null;
}

function fallbackTitle(
  mode: "initial" | "intent",
  firstPrompt: string,
  latestPrompt: string,
): string {
  if (mode === "intent" && latestPrompt.trim()) {
    return titleFromPrompt(latestPrompt);
  }
  if (isGreetingOnly(firstPrompt)) {
    return "Hello";
  }
  return titleFromPrompt(firstPrompt || latestPrompt || "New chat");
}

export async function generateChatTitle(input: {
  mode: "initial" | "intent";
  firstPrompt: string;
  latestPrompt: string;
}): Promise<string> {
  const first = input.firstPrompt.replace(/\s+/g, " ").trim();
  const latest = input.latestPrompt.replace(/\s+/g, " ").trim();

  const instructions =
    input.mode === "initial"
      ? isGreetingOnly(first)
        ? `The user's first message is only a greeting: "${first}". Write a short friendly chat title (1-3 words) like "Hello" or "Quick hello". Do not mention building yet.`
        : `Write a concise chat title (3-6 words) for this first message: "${first || latest}". Focus on what they want to build or discuss.`
      : `The user opened with a greeting ("${first}") and now stated their goal: "${latest}". Write a concise project chat title (3-6 words) for what they want — not a greeting.`;

  const prompt = [
    "You name Luca AI chat threads.",
    "Reply with ONLY the title text — no quotes, no punctuation at the end, max 48 characters.",
    instructions,
  ].join("\n");

  const ai = await generateTitleWithGemini(prompt);
  return ai ?? fallbackTitle(input.mode, first, latest);
}

export type ChatTitleMeta = {
  titleAiUpdates?: number;
  firstPromptGreeting?: boolean;
};

/** Returns new title when updated; null when skipped (already locked). */
export async function resolveChatTitleUpdate(input: {
  titleAiUpdates?: number;
  firstPromptGreeting?: boolean;
  userMessages: string[];
  latestUserMessage: string;
}): Promise<{
  title: string;
  titleAiUpdates: number;
  firstPromptGreeting: boolean;
} | null> {
  const updates = input.titleAiUpdates ?? 0;
  if (updates >= 2) return null;

  const userMessages = input.userMessages.map((m) => m.trim()).filter(Boolean);
  const firstUser = userMessages[0] ?? "";
  const latest =
    input.latestUserMessage.trim() || userMessages.at(-1) || firstUser;
  const firstWasGreeting =
    input.firstPromptGreeting ?? isGreetingOnly(firstUser);

  if (updates === 0) {
    const title = await generateChatTitle({
      mode: "initial",
      firstPrompt: firstUser,
      latestPrompt: latest,
    });
    return {
      title,
      titleAiUpdates: firstWasGreeting ? 1 : 2,
      firstPromptGreeting: firstWasGreeting,
    };
  }

  if (
    updates === 1 &&
    firstWasGreeting &&
    isSubstantiveIntent(latest) &&
    latest.toLowerCase() !== firstUser.toLowerCase()
  ) {
    const title = await generateChatTitle({
      mode: "intent",
      firstPrompt: firstUser,
      latestPrompt: latest,
    });
    return {
      title,
      titleAiUpdates: 2,
      firstPromptGreeting: true,
    };
  }

  return null;
}

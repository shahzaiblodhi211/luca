import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import {
  getGeminiKeys,
  markGeminiKeyHot,
  noteGeminiKeySuccess,
  pickGeminiKeyIndex,
  releaseGeminiKey,
} from "@/lib/gemini-keys";
import { DEFAULT_LIVE_VOICE_MODEL_ID } from "@/lib/live-voice-models";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  audioBase64?: string;
  mimeType?: string;
  modelId?: string;
};

/**
 * Transcribe mic audio with Gemini. Live native-audio models are dialog-only;
 * we use the chat Flash model for STT and keep modelId for UI/session labeling.
 */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const audioBase64 = body.audioBase64?.replace(/^data:[^;]+;base64,/, "").trim();
  const mimeType = body.mimeType?.trim() || "audio/webm";
  if (!audioBase64) {
    return NextResponse.json({ error: "Missing audio" }, { status: 400 });
  }

  const keys = getGeminiKeys();
  if (!keys.length) {
    return NextResponse.json(
      { error: "Luca voice is not configured on this server." },
      { status: 503 },
    );
  }

  const chatModel =
    process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
  const labelModel = body.modelId?.trim() || DEFAULT_LIVE_VOICE_MODEL_ID;

  let lastError = "Transcription failed";
  for (let attempt = 0; attempt < Math.min(keys.length, 4); attempt++) {
    const keyIndex = pickGeminiKeyIndex("chat");
    if (keyIndex == null) break;
    const apiKey = keys[keyIndex];
    if (!apiKey) {
      releaseGeminiKey("chat", keyIndex);
      break;
    }
    try {
      const ai = new GoogleGenAI({ apiKey });
      const res = await ai.models.generateContent({
        model: chatModel,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType, data: audioBase64 } },
              {
                text: [
                  "Transcribe the user's spoken words exactly.",
                  "Return only the transcript text — no quotes, labels, or commentary.",
                  "If nothing intelligible was said, return an empty string.",
                ].join(" "),
              },
            ],
          },
        ],
      });
      noteGeminiKeySuccess("chat", keyIndex);
      releaseGeminiKey("chat", keyIndex);
      const text =
        res.text?.trim() ||
        res.candidates?.[0]?.content?.parts
          ?.map((p) => ("text" in p && typeof p.text === "string" ? p.text : ""))
          .join("")
          .trim() ||
        "";
      return NextResponse.json({
        text,
        modelId: labelModel,
        engine: chatModel,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastError = message;
      markGeminiKeyHot("chat", keyIndex, { message });
      releaseGeminiKey("chat", keyIndex);
    }
  }

  return NextResponse.json({ error: lastError }, { status: 502 });
}

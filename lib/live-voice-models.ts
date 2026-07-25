export type LiveVoiceModel = {
  id: string;
  name: string;
  kind: "Live voice";
  /** Display-only quota columns matching AI Studio style. */
  quotas: [string, string, string];
};

export const LIVE_VOICE_MODELS: LiveVoiceModel[] = [
  {
    id: "gemini-2.5-flash-native-audio-dialog",
    name: "Luca Live Dialog",
    kind: "Live voice",
    quotas: ["0 / Unlimited", "0 / 1M", "0 / Unlimited"],
  },
  {
    id: "gemini-3-flash-live",
    name: "Luca Live Flash",
    kind: "Live voice",
    quotas: ["0 / Unlimited", "0 / 65K", "0 / Unlimited"],
  },
  {
    id: "gemini-3.5-live-translate",
    name: "Luca Live Translate",
    kind: "Live voice",
    quotas: ["0 / Unlimited", "0 / 20K", "0 / Unlimited"],
  },
];

/** Default Live voice model (row 1). */
export const DEFAULT_LIVE_VOICE_MODEL_ID = LIVE_VOICE_MODELS[0]!.id;

const STORAGE_KEY = "luca.liveVoiceModel";

export function readStoredLiveVoiceModel(): string {
  if (typeof window === "undefined") return DEFAULT_LIVE_VOICE_MODEL_ID;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && LIVE_VOICE_MODELS.some((m) => m.id === v)) return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_LIVE_VOICE_MODEL_ID;
}

export function storeLiveVoiceModel(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

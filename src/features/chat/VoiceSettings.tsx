import { useEffect, useState } from "react";

// Global, app-wide TTS preferences persisted in localStorage and shared between
// the VoiceOutput player and the "Test my voices" picker dialog.
export type VoicePrefs = {
  arVoiceURI: string | null;
  enVoiceURI: string | null;
  preferFemale: boolean;
};

const STORAGE_KEY = "astra-voice-prefs-v1";
const EVENT = "astra-voice-prefs-changed";

const DEFAULT: VoicePrefs = { arVoiceURI: null, enVoiceURI: null, preferFemale: true };

export function loadVoicePrefs(): VoicePrefs {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return DEFAULT;
  }
}

export function saveVoicePrefs(patch: Partial<VoicePrefs>) {
  if (typeof window === "undefined") return;
  const next = { ...loadVoicePrefs(), ...patch };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  // Bust the pick cache so the next utterance respects the new pick.
  pickCache.clear();
}

export function useVoicePrefs(): VoicePrefs {
  const [prefs, setPrefs] = useState<VoicePrefs>(DEFAULT);
  useEffect(() => {
    setPrefs(loadVoicePrefs());
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<VoicePrefs>).detail;
      if (detail) setPrefs(detail);
      else setPrefs(loadVoicePrefs());
    };
    window.addEventListener(EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  return prefs;
}

// ---------- Async voice loading (Chrome / Android Chrome quirk) ----------
// speechSynthesis.getVoices() returns [] on first call in most browsers — the
// list arrives asynchronously via the `voiceschanged` event. Wait for it with
// a hard timeout so we never block forever on a broken engine.
let cachedVoices: SpeechSynthesisVoice[] | null = null;
let pendingLoad: Promise<SpeechSynthesisVoice[]> | null = null;

export function awaitVoices(timeoutMs = 3000): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return Promise.resolve([]);
  }
  if (cachedVoices && cachedVoices.length) return Promise.resolve(cachedVoices);
  if (pendingLoad) return pendingLoad;

  pendingLoad = new Promise<SpeechSynthesisVoice[]>((resolve) => {
    const synth = window.speechSynthesis;
    const tryNow = () => {
      const list = synth.getVoices();
      if (list && list.length) {
        cachedVoices = list;
        cleanup();
        resolve(list);
        return true;
      }
      return false;
    };
    const onChange = () => { tryNow(); };
    const interval = window.setInterval(() => { tryNow(); }, 200);
    const timeout = window.setTimeout(() => {
      const list = synth.getVoices() || [];
      cachedVoices = list;
      cleanup();
      resolve(list);
    }, timeoutMs);
    const cleanup = () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      synth.removeEventListener?.("voiceschanged", onChange);
      pendingLoad = null;
    };
    synth.addEventListener?.("voiceschanged", onChange);
    // Some engines need a kick — calling getVoices() triggers the populate.
    if (tryNow()) return;
  });
  return pendingLoad;
}

// Subscribe to voice changes (e.g. user installs a new system voice).
export function onVoicesChanged(cb: (voices: SpeechSynthesisVoice[]) => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return () => {};
  const synth = window.speechSynthesis;
  const handler = () => {
    const list = synth.getVoices() || [];
    cachedVoices = list;
    pickCache.clear();
    cb(list);
  };
  synth.addEventListener?.("voiceschanged", handler);
  return () => synth.removeEventListener?.("voiceschanged", handler);
}

// ---------- Voice ranking ----------
const FEMALE_HINTS = [
  "female", "woman", "samantha", "victoria", "karen", "moira", "tessa", "fiona",
  "zira", "hazel", "susan", "linda", "amy", "joanna", "salli", "kimberly", "ivy",
  "ella", "ava", "allison", "kendra", "nicole", "emma", "olivia", "sophia",
  "google us english", "google uk english female",
  "hoda", "laila", "salma", "naayf", "amira", "zariyah", "زينة", "هدى", "ليلى",
];
const MALE_HINTS = ["male", "man", "daniel", "alex", "fred", "david", "mark", "george", "tom", "ahmed", "khalid"];

function score(voice: SpeechSynthesisVoice, langPrefix: "ar" | "en", preferFemale: boolean) {
  const n = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase();
  let s = 0;

  // Local voices are unlimited and instant — huge boost.
  if (voice.localService) s += 10;

  // Strong, energetic English voices. Google US English is the gold standard
  // on Chrome desktop & Android Chrome; treat it as the default English voice.
  if (langPrefix === "en") {
    if (n === "google us english" || n.includes("google us english")) s += 60;
    if (n.includes("google uk english")) s += 35;
    if (n.includes("google") && lang.startsWith("en")) s += 25;
    // Microsoft Natural / Neural voices (Edge, Win11) — premium quality.
    if (n.includes("natural") || n.includes("neural")) s += 30;
    if (n.includes("aria") || n.includes("jenny") || n.includes("guy")) s += 20;
    // Apple premium voices.
    if (n.includes("samantha") || n.includes("ava") || n.includes("allison")) s += 18;
    // Prefer en-US then en-GB then any English.
    if (lang.startsWith("en-us")) s += 15;
    else if (lang.startsWith("en-gb")) s += 8;
    else if (lang.startsWith("en")) s += 3;
  }

  if (langPrefix === "ar") {
    if (n.includes("google") && lang.startsWith("ar")) s += 40;
    if (n.includes("natural") || n.includes("neural")) s += 25;
    if (n.includes("hoda") || n.includes("salma") || n.includes("laila") || n.includes("amira")) s += 20;
    if (n.includes("majed")) s += 14;
    if (lang.startsWith("ar-sa")) s += 10;
    else if (lang.startsWith("ar-eg")) s += 8;
    else if (lang.startsWith("ar")) s += 4;
  }

  if (n.includes("premium") || n.includes("enhanced")) s += 12;

  if (preferFemale) {
    if (FEMALE_HINTS.some((h) => n.includes(h))) s += 8;
    if (MALE_HINTS.some((h) => n.includes(h))) s -= 6;
  }
  return s;
}

// Cache best-pick per (langPrefix + prefs signature) so we don't re-sort the
// voice list for every chunk of every message.
const pickCache = new Map<string, SpeechSynthesisVoice | undefined>();

export function pickBestVoice(
  voices: SpeechSynthesisVoice[],
  langPrefix: "ar" | "en",
  prefs: VoicePrefs,
): SpeechSynthesisVoice | undefined {
  if (!voices.length) return undefined;
  const saved = langPrefix === "ar" ? prefs.arVoiceURI : prefs.enVoiceURI;
  if (saved) {
    const exact = voices.find((v) => v.voiceURI === saved);
    // Only honor a saved voice if it actually matches the requested language —
    // otherwise an Arabic chunk would be spoken with the saved English voice
    // and the engine silently skips the Arabic characters.
    if (exact && exact.lang.toLowerCase().startsWith(langPrefix)) return exact;
  }

  const cacheKey = `${langPrefix}|${prefs.preferFemale ? "f" : "m"}|${voices.length}`;
  if (pickCache.has(cacheKey)) return pickCache.get(cacheKey);

  const matching = voices.filter((v) => v.lang.toLowerCase().startsWith(langPrefix));
  if (!matching.length) {
    pickCache.set(cacheKey, undefined);
    return undefined;
  }
  const best = [...matching].sort(
    (a, b) => score(b, langPrefix, prefs.preferFemale) - score(a, langPrefix, prefs.preferFemale),
  )[0];
  pickCache.set(cacheKey, best);
  return best;
}

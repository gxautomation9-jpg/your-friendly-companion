import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RefreshCcw, RotateCcw, Settings2, Square, Volume2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useVoicePrefs, pickBestVoice, loadVoicePrefs, awaitVoices, onVoicesChanged } from "@/features/chat/VoiceSettings";
import { VoiceTestDialog } from "@/features/chat/VoiceTestDialog";
import { fetchCloudTtsUrl } from "@/features/chat/CloudVoices";

type PlaybackState = "idle" | "playing" | "paused";
const VOICE_OUTPUT_START = "astra-voice-output-start";
// Keep chunks short so Chrome's ~15s per-utterance limit never truncates
// long replies (common symptom: TTS stops reading after ~5 lines).
const MAX_CHUNK_LENGTH = 110;

function isArabic(text: string) {
  return /[\u0600-\u06FF]/.test(text);
}

function normalizeSpeechText(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/[>*_~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitForSpeech(text: string) {
  // 1) Break the text on real sentence terminators so we never read the
  //    end of one sentence together with the start of the next.
  const sentenceRegex = /[^.!?؟؛。\n]+[.!?؟؛。]?/g;
  const sentences = (text.match(sentenceRegex) ?? [text])
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];

  for (const sentence of sentences) {
    if (sentence.length <= MAX_CHUNK_LENGTH) {
      // Each sentence stays its own utterance — preserves natural pauses
      // and prevents the "ends sentence + reads 2 words of the next" glitch.
      chunks.push(sentence);
      continue;
    }

    // 2) Long sentence: split on clause punctuation (commas, dashes, colons,
    //    semicolons — including Arabic comma). The terminator stays attached
    //    to the clause so the engine still pauses naturally.
    const clauses = sentence
      .split(/(?<=[,،;:—–])\s+/)
      .map((c) => c.trim())
      .filter(Boolean);

    let buf = "";
    const flush = () => { if (buf.trim()) chunks.push(buf.trim()); buf = ""; };

    for (const clause of clauses) {
      if (clause.length > MAX_CHUNK_LENGTH) {
        // 3) Last-resort word split for very long clauses.
        flush();
        let partial = "";
        for (const w of clause.split(/\s+/)) {
          if ((partial + " " + w).trim().length > MAX_CHUNK_LENGTH) {
            if (partial.trim()) chunks.push(partial.trim());
            partial = w;
          } else {
            partial = (partial + " " + w).trim();
          }
        }
        if (partial.trim()) chunks.push(partial.trim());
        continue;
      }
      if ((buf + " " + clause).trim().length > MAX_CHUNK_LENGTH) flush();
      buf = (buf + " " + clause).trim();
    }
    flush();
  }

  return chunks;
}

type LangChunk = { text: string; lang: "ar" | "en" };

// Split a chunk into runs of the same language so mixed-language assistant
// replies switch to the correct voice for each run.
function splitByLanguage(chunk: string): LangChunk[] {
  const runs: LangChunk[] = [];
  // Tokenise on whitespace but keep an Arabic/Latin classification per token.
  const tokens = chunk.split(/(\s+)/);
  let buf = "";
  let bufLang: "ar" | "en" | null = null;
  for (const tok of tokens) {
    if (!tok) continue;
    if (/^\s+$/.test(tok)) { buf += tok; continue; }
    const hasAr = /[\u0600-\u06FF]/.test(tok);
    const hasLatin = /[A-Za-z]/.test(tok);
    const lang: "ar" | "en" | null = hasAr ? "ar" : hasLatin ? "en" : null;
    if (lang == null) { buf += tok; continue; }
    if (bufLang == null) { bufLang = lang; buf += tok; continue; }
    if (lang === bufLang) { buf += tok; continue; }
    const out = buf.trim();
    if (out) runs.push({ text: out, lang: bufLang });
    buf = tok;
    bufLang = lang;
  }
  const out = buf.trim();
  if (out && bufLang) runs.push({ text: out, lang: bufLang });
  if (!runs.length) runs.push({ text: chunk, lang: isArabic(chunk) ? "ar" : "en" });
  // Merge tiny runs (<3 chars) into the previous one to avoid micro-switches.
  const merged: LangChunk[] = [];
  for (const r of runs) {
    const prev = merged[merged.length - 1];
    if (prev && r.text.length < 3) prev.text += " " + r.text;
    else merged.push({ ...r });
  }
  return merged;
}

function getVoices() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  return window.speechSynthesis.getVoices();
}

type Diagnostics = {
  lastError: string | null;
  lastErrorChunkIndex: number | null;
  voiceName: string | null;
  voiceURI: string | null;
  voiceLang: string | null;
  chunkIndex: number;
  chunkCount: number;
  recommendation: string | null;
};

type SpeechSegment = {
  text: string;
  lang: "ar" | "en";
};

export function VoiceOutput({
  text,
  appLang,
  preferLang,
}: {
  text: string;
  appLang: "ar" | "en";
  preferLang?: "ar" | "en";
}) {
  const [state, setState] = useState<PlaybackState>("idle");
  const [speed, setSpeed] = useState(1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [diag, setDiag] = useState<Diagnostics>({
    lastError: null,
    lastErrorChunkIndex: null,
    voiceName: null,
    voiceURI: null,
    voiceLang: null,
    chunkIndex: 0,
    chunkCount: 0,
    recommendation: null,
  });

  const segmentsRef = useRef<SpeechSegment[]>([]);
  const segmentIndexRef = useRef(0);
  const playTokenRef = useRef(0);
  const stoppedRef = useRef(false);
  const activeRef = useRef(false);
  const speedRef = useRef(speed);
  const instanceIdRef = useRef(Math.random());
  const prevSpeedRef = useRef(speed);
  const stateRef = useRef<PlaybackState>("idle");
  const cloudAudioRef = useRef<HTMLAudioElement | null>(null);
  const cloudUrlRef = useRef<string | null>(null);
  const cloudAbortRef = useRef<AbortController | null>(null);
  const sourceRef = useRef<"local" | "cloud" | null>(null);
  const lastActivityRef = useRef(0);
  const lastAudioTimeRef = useRef(0);
  const segmentDeadlineRef = useRef(0);
  const recoveryAttemptsRef = useRef(0);
  const userPausedRef = useRef(false);
  const playSegmentRef = useRef<(token: number) => void>(() => undefined);

  useVoicePrefs();
  const speechText = useMemo(() => normalizeSpeechText(text), [text]);
  const fallbackLang: "ar" | "en" = useMemo(
    () => preferLang ?? (isArabic(speechText) ? "ar" : "en"),
    [preferLang, speechText],
  );

  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  const copy = useMemo(
    () =>
      appLang === "ar"
        ? {
            play: "تشغيل", pause: "إيقاف مؤقت", stop: "إيقاف", replay: "إعادة",
            regenerate: "تجديد الصوت", speed: "السرعة",
            diagnostics: "تشخيص الصوت", testVoices: "اختبر أصواتي",
            voice: "الصوت", lang: "اللغة", chunk: "المقطع", lastError: "آخر خطأ",
            none: "لا يوجد", recommend: "اقتراح",
            voiceUnavailable: "لم يتم العثور على صوت متوافق. افتح \"اختبر أصواتي\" واختر صوتاً يعمل.",
            recoNoVoice: "ثبّت صوتاً عربياً من إعدادات النظام، أو اختر صوتاً آخر من \"اختبر أصواتي\".",
            recoInterrupted: "تم قطع التشغيل. تأكد أن تبويباً آخر لا يستخدم الصوت ثم أعد المحاولة.",
            recoSynthFailed: "فشل التركيب — جرّب صوتاً محلياً (local) من قائمة \"اختبر أصواتي\".",
            recoNetwork: "انتهت حصة الصوت السحابي. افتح إعدادات Google على هاتفك (الإعدادات → النظام → اللغات والإدخال → الإخراج الصوتي → محرك Google لتحويل النص إلى كلام → تثبيت بيانات الصوت → العربية)، ثم اختر صوتاً محلياً من \"اختبر أصواتي\".",
          }
        : {
            play: "Play", pause: "Pause", stop: "Stop", replay: "Replay",
            regenerate: "Regenerate audio", speed: "Speed",
            diagnostics: "Voice diagnostics", testVoices: "Test my voices",
            voice: "Voice", lang: "Lang", chunk: "Chunk", lastError: "Last error",
            none: "None", recommend: "Recommendation",
            voiceUnavailable: "No compatible voice found. Open \"Test my voices\" and pick one that works.",
            recoNoVoice: "Install a system voice for this language, or pick a different one from \"Test my voices\".",
            recoInterrupted: "Playback was interrupted. Make sure no other tab is using audio and try again.",
            recoSynthFailed: "Synthesis failed — try a local (offline) voice from \"Test my voices\".",
            recoNetwork: "Cloud voice quota is exhausted. Open your Google settings (Settings → System → Languages & input → Text-to-speech output → Google TTS → Install voice data), then pick a local voice from \"Test my voices\".",
          },
    [appLang],
  );

  const recommendationFor = useCallback(
    (errorCode: string | null, hadVoice: boolean) => {
      if (!errorCode) return null;
      if (!hadVoice) return copy.recoNoVoice;
      if (errorCode === "interrupted" || errorCode === "canceled") return copy.recoInterrupted;
      if (errorCode === "network" || errorCode === "audio-busy") return copy.recoNetwork;
      if (errorCode === "synthesis-failed" || errorCode === "synthesis-unavailable") return copy.recoSynthFailed;
      return copy.recoSynthFailed;
    },
    [copy],
  );

  const setPlaybackState = useCallback((next: PlaybackState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const buildSegments = useCallback(
    (value: string) =>
      splitForSpeech(value).flatMap((chunk) => {
        const runs = splitByLanguage(chunk);
        if (runs.length) {
          return runs
            .map((run) => ({ text: run.text.trim(), lang: run.lang }))
            .filter((run) => run.text.length > 0);
        }
        return [{ text: chunk.trim(), lang: fallbackLang } satisfies SpeechSegment];
      }),
    [fallbackLang],
  );

  const estimateSegmentDeadline = useCallback((segment: SpeechSegment, rate: number, isCloud: boolean) => {
    const baseMs = Math.max(3_200, Math.round((segment.text.length * 92) / Math.max(rate, 0.7)));
    return Date.now() + Math.min(isCloud ? 18_000 : 14_000, baseMs + (isCloud ? 6_000 : 3_500));
  }, []);

  const revokeCloudUrl = useCallback(() => {
    if (cloudUrlRef.current) {
      try { URL.revokeObjectURL(cloudUrlRef.current); } catch { /* noop */ }
      cloudUrlRef.current = null;
    }
  }, []);

  const cleanupCloud = useCallback((abortFetch = false) => {
    if (abortFetch && cloudAbortRef.current) {
      try { cloudAbortRef.current.abort(); } catch { /* noop */ }
    }
    cloudAbortRef.current = null;
    if (sourceRef.current === "cloud") sourceRef.current = null;
    if (cloudAudioRef.current) {
      try { cloudAudioRef.current.pause(); } catch { /* noop */ }
      cloudAudioRef.current.src = "";
      cloudAudioRef.current = null;
    }
    revokeCloudUrl();
  }, [revokeCloudUrl]);

  const restartCurrentSegment = useCallback((reason: string, fallbackNotice?: string) => {
    if (!supported || stoppedRef.current || userPausedRef.current) return;

    setDiag((d) => ({
      ...d,
      lastError: reason,
      lastErrorChunkIndex: segmentIndexRef.current,
      recommendation: fallbackNotice ?? d.recommendation,
    }));

    if (recoveryAttemptsRef.current >= 2) {
      activeRef.current = false;
      cleanupCloud(true);
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
      setPlaybackState("idle");
      if (fallbackNotice) setNotice(fallbackNotice);
      return;
    }

    recoveryAttemptsRef.current += 1;
    playTokenRef.current += 1;
    const token = playTokenRef.current;
    lastActivityRef.current = Date.now();
    cleanupCloud(true);
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }

    window.setTimeout(() => {
      if (token !== playTokenRef.current || stoppedRef.current || userPausedRef.current) return;
      playSegmentRef.current(token);
    }, 120);
  }, [cleanupCloud, setPlaybackState, supported]);

  const advanceToNextSegment = useCallback((token: number) => {
    recoveryAttemptsRef.current = 0;
    segmentIndexRef.current += 1;
    setProgress(segmentsRef.current.length ? segmentIndexRef.current / segmentsRef.current.length : 1);

    if (segmentIndexRef.current >= segmentsRef.current.length) {
      activeRef.current = false;
      cleanupCloud(false);
      setProgress(1);
      setPlaybackState("idle");
      return;
    }

    lastActivityRef.current = Date.now();
    // Give the engine a moment to fully drain the previous utterance.
    // Chrome has a well-known race where speak() called immediately after
    // an onend (or after an internal cancel) plays only the first 1–2 words
    // of the next utterance and then goes silent. A ~220ms gap, combined
    // with an explicit cancel(), avoids that and produces natural pacing
    // between sentences.
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    window.setTimeout(() => {
      if (token !== playTokenRef.current || stoppedRef.current || userPausedRef.current) return;
      playSegmentRef.current(token);
    }, 220);
  }, [cleanupCloud, setPlaybackState]);

  const playSegment = useCallback((token: number) => {
    if (!supported || stoppedRef.current || token !== playTokenRef.current) return;

    const segment = segmentsRef.current[segmentIndexRef.current];
    if (!segment) {
      activeRef.current = false;
      cleanupCloud(false);
      setProgress(1);
      setPlaybackState("idle");
      return;
    }

    const rate = Math.min(1.25, speedRef.current * 1.08);
    const pitch = segment.lang === "ar" ? 1.18 : 1.22;
    const latestVoices = getVoices();
    const pool = latestVoices.length ? latestVoices : voices;
    const currentPrefs = loadVoicePrefs();
    const cloudVoiceId = segment.lang === "ar" ? currentPrefs.arCloudVoice : currentPrefs.enCloudVoice;
    const selectedVoice = pickBestVoice(pool, segment.lang, currentPrefs);

    lastActivityRef.current = Date.now();
    segmentDeadlineRef.current = estimateSegmentDeadline(segment, rate, !!cloudVoiceId);

    if (cloudVoiceId) {
      cleanupCloud(true);
      sourceRef.current = "cloud";
      const ac = new AbortController();
      cloudAbortRef.current = ac;

      setDiag((d) => ({
        ...d,
        voiceName: `Gemini · ${cloudVoiceId}`,
        voiceURI: `cloud:${cloudVoiceId}`,
        voiceLang: segment.lang === "ar" ? "ar-EG" : "en-US",
        chunkIndex: segmentIndexRef.current,
        chunkCount: segmentsRef.current.length,
      }));

      fetchCloudTtsUrl(segment.text, cloudVoiceId, segment.lang, ac.signal)
        .then((url) => {
          if (token !== playTokenRef.current || stoppedRef.current || userPausedRef.current) {
            URL.revokeObjectURL(url);
            return;
          }

          cloudUrlRef.current = url;
          const audio = new Audio(url);
          audio.preload = "auto";
          audio.playbackRate = rate;
          cloudAudioRef.current = audio;

          audio.onplay = () => {
            if (token !== playTokenRef.current) return;
            activeRef.current = true;
            lastActivityRef.current = Date.now();
            lastAudioTimeRef.current = audio.currentTime;
            setNotice(null);
            setPlaybackState("playing");
          };
          audio.ontimeupdate = () => {
            lastAudioTimeRef.current = audio.currentTime;
            lastActivityRef.current = Date.now();
          };
          audio.onpause = () => {
            if (token !== playTokenRef.current || userPausedRef.current || audio.ended) return;
            restartCurrentSegment("cloud-paused", copy.recoSynthFailed);
          };
          audio.onended = () => {
            if (token !== playTokenRef.current || stoppedRef.current || userPausedRef.current) return;
            cleanupCloud(false);
            advanceToNextSegment(token);
          };
          audio.onerror = () => {
            if (token !== playTokenRef.current || userPausedRef.current) return;
            restartCurrentSegment("cloud-playback-failed", copy.recoNetwork);
          };

          audio.play().catch(() => {
            restartCurrentSegment("cloud-play-rejected", copy.recoNetwork);
          });
        })
        .catch((err) => {
          if ((err as Error).name === "AbortError") return;
          if (token !== playTokenRef.current || userPausedRef.current) return;
          restartCurrentSegment("cloud-tts-failed", copy.recoNetwork);
        });
      return;
    }

    sourceRef.current = "local";

    const utterance = new SpeechSynthesisUtterance(segment.text);
    utterance.lang = selectedVoice?.lang || (segment.lang === "ar" ? "ar-SA" : "en-US");
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = 1;
    if (selectedVoice && selectedVoice.lang.toLowerCase().startsWith(segment.lang)) {
      utterance.voice = selectedVoice;
    } else if (!selectedVoice) {
      setNotice(copy.voiceUnavailable);
    }

    setDiag((d) => ({
      ...d,
      voiceName: selectedVoice?.name ?? null,
      voiceURI: selectedVoice?.voiceURI ?? null,
      voiceLang: utterance.lang,
      chunkIndex: segmentIndexRef.current,
      chunkCount: segmentsRef.current.length,
    }));

    utterance.onstart = () => {
      if (token !== playTokenRef.current) return;
      activeRef.current = true;
      lastActivityRef.current = Date.now();
      setNotice(null);
      setPlaybackState("playing");
    };
    utterance.onboundary = () => {
      lastActivityRef.current = Date.now();
    };
    utterance.onresume = () => {
      lastActivityRef.current = Date.now();
    };
    utterance.onend = () => {
      if (token !== playTokenRef.current || stoppedRef.current || userPausedRef.current) return;
      advanceToNextSegment(token);
    };
    utterance.onerror = (event) => {
      if (token !== playTokenRef.current) return;
      if (userPausedRef.current) return;

      const code = (event.error as string) || "unknown";
      const reco = recommendationFor(code, !!selectedVoice);

      setDiag((d) => ({
        ...d,
        lastError: code,
        lastErrorChunkIndex: segmentIndexRef.current,
        recommendation: reco,
      }));

      const hardFail = ["synthesis-failed", "synthesis-unavailable", "audio-busy", "audio-hardware", "language-unavailable", "voice-unavailable", "network"].includes(code);
      if (hardFail) {
        activeRef.current = false;
        setPlaybackState("idle");
        setNotice(reco ?? copy.voiceUnavailable);
        return;
      }

      restartCurrentSegment(code, reco ?? copy.recoInterrupted);
    };

    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      restartCurrentSegment("speech-start-failed", copy.recoSynthFailed);
    }
  }, [advanceToNextSegment, cleanupCloud, copy.recoInterrupted, copy.recoNetwork, copy.recoSynthFailed, copy.voiceUnavailable, estimateSegmentDeadline, recommendationFor, setPlaybackState, supported, voices]);

  playSegmentRef.current = playSegment;

  const stop = useCallback(
    (silent = false) => {
      stoppedRef.current = true;
      userPausedRef.current = false;
      activeRef.current = false;
      playTokenRef.current += 1;
      segmentsRef.current = [];
      segmentIndexRef.current = 0;
      recoveryAttemptsRef.current = 0;
      sourceRef.current = null;
      setProgress(0);
      setNotice(null);
      if (supported) {
        try { window.speechSynthesis.cancel(); } catch { /* noop */ }
      }
      cleanupCloud(true);
      if (!silent) setPlaybackState("idle");
    },
    [cleanupCloud, setPlaybackState, supported],
  );


  const createAndPlay = useCallback(() => {
    if (!supported || !speechText.trim()) return;
    const segments = buildSegments(speechText);
    if (!segments.length) return;

    playTokenRef.current += 1;
    const token = playTokenRef.current;
    stoppedRef.current = false;
    userPausedRef.current = false;
    activeRef.current = true;
    segmentsRef.current = segments;
    segmentIndexRef.current = 0;
    recoveryAttemptsRef.current = 0;
    lastActivityRef.current = Date.now();
    setProgress(0);
    setNotice(null);
    setDiag((d) => ({ ...d, lastError: null, lastErrorChunkIndex: null, recommendation: null, chunkIndex: 0, chunkCount: segments.length }));

    window.dispatchEvent(new CustomEvent(VOICE_OUTPUT_START, { detail: { id: instanceIdRef.current } }));
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    cleanupCloud(true);
    setPlaybackState("playing");
    window.setTimeout(() => {
      if (token === playTokenRef.current && !stoppedRef.current) playSegmentRef.current(token);
    }, 120);
  }, [buildSegments, cleanupCloud, setPlaybackState, speechText, supported]);

  const playOrResume = () => {
    if (!supported) return;
    if (state === "paused") {
      userPausedRef.current = false;
      activeRef.current = true;
      playTokenRef.current += 1;
      const token = playTokenRef.current;
      lastActivityRef.current = Date.now();
      setPlaybackState("playing");
      window.setTimeout(() => {
        if (token === playTokenRef.current && !stoppedRef.current) playSegmentRef.current(token);
      }, 120);
      return;
    }
    createAndPlay();
  };
  const pause = () => {
    if (!supported) return;
    userPausedRef.current = true;
    activeRef.current = false;
    if (sourceRef.current === "cloud" || cloudAudioRef.current || cloudAbortRef.current) {
      cleanupCloud(true);
      setPlaybackState("paused");
      return;
    }
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    setPlaybackState("paused");
  };
  const replay = () => createAndPlay();

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    // Wait (up to 3s) for the engine to populate voices. On Chrome desktop
    // and Android Chrome the first getVoices() call returns [] until the
    // `voiceschanged` event fires — awaitVoices handles that asynchronously.
    awaitVoices(3000).then((list) => {
      if (!cancelled && list.length) setVoices(list);
    });
    const unsubscribe = onVoicesChanged((list) => {
      if (!cancelled) setVoices(list);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [supported]);

  useEffect(() => {
    if (!supported) return;

    const timer = window.setInterval(() => {
      if (stoppedRef.current || userPausedRef.current || stateRef.current !== "playing") return;
      const segment = segmentsRef.current[segmentIndexRef.current];
      if (!segment) return;

      const now = Date.now();
      if (sourceRef.current === "cloud") {
        if (!cloudAudioRef.current) {
          if (now > segmentDeadlineRef.current || now - lastActivityRef.current > 6_000) {
            restartCurrentSegment("cloud-fetch-stalled", copy.recoNetwork);
          }
          return;
        }

        const audio = cloudAudioRef.current;
        if (audio.ended) return;

        if (Math.abs(audio.currentTime - lastAudioTimeRef.current) > 0.01) {
          lastAudioTimeRef.current = audio.currentTime;
          lastActivityRef.current = now;
        }

        if (audio.paused && now - lastActivityRef.current > 900) {
          restartCurrentSegment("cloud-paused", copy.recoSynthFailed);
          return;
        }

        if (now > segmentDeadlineRef.current || now - lastActivityRef.current > 3_500) {
          restartCurrentSegment("cloud-stalled", copy.recoSynthFailed);
        }
        return;
      }

      const synth = window.speechSynthesis;
      if (synth.speaking || synth.pending) {
        if (now > segmentDeadlineRef.current) {
          restartCurrentSegment("speech-timeout", copy.recoInterrupted);
        }
        return;
      }

      if (now - lastActivityRef.current > 2_200) {
        restartCurrentSegment("speech-stalled", copy.recoInterrupted);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [copy.recoInterrupted, copy.recoNetwork, copy.recoSynthFailed, restartCurrentSegment, supported]);

  useEffect(() => {
    const onOther = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: number }>).detail;
      if (detail?.id === instanceIdRef.current) return;
      if (!activeRef.current) return;
      stop(true);
    };
    window.addEventListener(VOICE_OUTPUT_START, onOther);
    return () => window.removeEventListener(VOICE_OUTPUT_START, onOther);
  }, [stop]);

  // Stop on unmount.
  useEffect(() => () => { stop(true); }, [stop]);

  useEffect(() => {
    speedRef.current = speed;
    if (prevSpeedRef.current === speed) return;
    prevSpeedRef.current = speed;
    if (cloudAudioRef.current) {
      cloudAudioRef.current.playbackRate = Math.min(1.25, speed * 1.08);
    }
    if (stateRef.current === "playing" && activeRef.current) {
      playTokenRef.current += 1;
      const token = playTokenRef.current;
      cleanupCloud(false);
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
      window.setTimeout(() => {
        if (token === playTokenRef.current && !stoppedRef.current && !userPausedRef.current) {
          playSegmentRef.current(token);
        }
      }, 120);
    }
  }, [cleanupCloud, speed]);

  if (!supported || !speechText.trim()) return null;

  return (
    <div className="mt-3 rounded-xl border border-border/60 bg-background/35 p-2" dir={appLang === "ar" ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-center gap-1.5">
        {state === "playing" ? (
          <Button type="button" size="icon" variant="secondary" onClick={pause} aria-label={copy.pause} title={copy.pause}>
            <Pause className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button type="button" size="icon" variant="secondary" onClick={playOrResume} aria-label={copy.play} title={copy.play}>
            <Play className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button type="button" size="icon" variant="ghost" onClick={() => stop()} aria-label={copy.stop} title={copy.stop}>
          <Square className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" size="icon" variant="ghost" onClick={replay} aria-label={copy.replay} title={copy.replay}>
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" size="icon" variant="ghost" onClick={createAndPlay} aria-label={copy.regenerate} title={copy.regenerate}>
          <RefreshCcw className="h-3.5 w-3.5" />
        </Button>

        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" size="icon" variant="ghost" aria-label={copy.diagnostics} title={copy.diagnostics}>
              <Info className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 text-xs" dir={appLang === "ar" ? "rtl" : "ltr"}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">{copy.diagnostics}</span>
              <VoiceTestDialog
                appLang={appLang}
                trigger={
                  <Button type="button" size="sm" variant="outline" className="h-7">
                    <Settings2 className="me-1 h-3 w-3" /> {copy.testVoices}
                  </Button>
                }
              />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">{copy.voice}</dt>
              <dd className="truncate">{diag.voiceName ?? copy.none}</dd>
              <dt className="text-muted-foreground">{copy.lang}</dt>
              <dd className="truncate">{diag.voiceLang ?? copy.none}</dd>
              <dt className="text-muted-foreground">{copy.chunk}</dt>
              <dd>{diag.chunkCount ? `${diag.chunkIndex + 1} / ${diag.chunkCount}` : "—"}</dd>
              <dt className="text-muted-foreground">{copy.lastError}</dt>
              <dd className="truncate">
                {diag.lastError ? `${diag.lastError}${diag.lastErrorChunkIndex != null ? ` @ #${diag.lastErrorChunkIndex + 1}` : ""}` : copy.none}
              </dd>
            </dl>
            {diag.recommendation && (
              <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-amber-200">
                <span className="font-medium">{copy.recommend}: </span>{diag.recommendation}
              </p>
            )}
          </PopoverContent>
        </Popover>

        <div className="ms-2 flex min-w-40 flex-1 items-center gap-2 text-xs text-muted-foreground" dir="ltr">
          <Volume2 className="h-3.5 w-3.5 shrink-0" />
          <span className="shrink-0">{copy.speed}</span>
          <Slider value={[speed]} min={0.7} max={1.2} step={0.05} onValueChange={([v]) => setSpeed(v ?? 1)} className="min-w-20 flex-1" />
          <span className="w-9 text-end tabular-nums">{speed.toFixed(2)}×</span>
        </div>
      </div>

      {(state === "playing" || state === "paused" || progress > 0 || notice) && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted/40" aria-hidden="true">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(4, Math.round(progress * 100))}%` }} />
        </div>
      )}
      {notice && (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{notice}</span>
          <VoiceTestDialog
            appLang={appLang}
            trigger={<Button type="button" size="sm" variant="outline" className="h-7">{copy.testVoices}</Button>}
          />
        </div>
      )}
    </div>
  );
}

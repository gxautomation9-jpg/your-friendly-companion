// Curated catalog of Gemini-powered cloud voices. Each maps to a distinct
// prebuilt speaker — no two entries share the same voice ID.
export type CloudVoice = {
  id: string;         // Gemini prebuilt voice name
  label: string;      // shown to the user
  hint: string;       // personality hint
  female: boolean;
};

// Egyptian-styled Arabic cloud voices. The accent comes from a prompt prefix
// in the /api/tts route; the IDs here are picked to sound distinct from each
// other (different timbres / energy levels).
export const CLOUD_AR_VOICES: CloudVoice[] = [
  { id: "Leda",         label: "ليلى — مذيعة مصرية حيوية",   hint: "warm · energetic",  female: true  },
  { id: "Aoede",        label: "آية — شبابية مرحة",            hint: "young · playful",   female: true  },
  { id: "Kore",         label: "كوثر — دافئة وهادئة",          hint: "soft · warm",       female: true  },
  { id: "Callirrhoe",   label: "كاميليا — معبّرة دراميّة",     hint: "expressive",        female: true  },
  { id: "Autonoe",      label: "نور — احترافية واضحة",         hint: "clear · pro",       female: true  },
  { id: "Despina",      label: "ديانا — صوت مذيعة أخبار",      hint: "anchor",            female: true  },
  { id: "Laomedeia",    label: "ليلى الصغيرة — مفعمة بالحيوية", hint: "bright · lively",   female: true  },
  { id: "Pulcherrima",  label: "بسمة — مرحة ومبتسمة",           hint: "smiley · upbeat",   female: true  },
  { id: "Charon",       label: "كريم — صوت ذكوري عميق",        hint: "deep · calm",       female: false },
  { id: "Fenrir",       label: "فارس — قوي وحماسي",            hint: "bold · energetic",  female: false },
  { id: "Orus",         label: "عمر — هادئ وواثق",             hint: "confident",         female: false },
  { id: "Iapetus",      label: "إياد — صوت رواية",             hint: "narrator",          female: false },
];

export const CLOUD_EN_VOICES: CloudVoice[] = [
  { id: "Puck",         label: "Puck — playful & bright",      hint: "playful",          female: false },
  { id: "Zephyr",       label: "Zephyr — airy & friendly",     hint: "friendly",         female: false },
  { id: "Charon",       label: "Charon — deep & calm",         hint: "deep",             female: false },
  { id: "Fenrir",       label: "Fenrir — bold & energetic",    hint: "energetic",        female: false },
  { id: "Leda",         label: "Leda — warm female",           hint: "warm",             female: true  },
  { id: "Aoede",        label: "Aoede — bright female",        hint: "bright",           female: true  },
  { id: "Kore",         label: "Kore — soft female",           hint: "soft",             female: true  },
  { id: "Autonoe",      label: "Autonoe — clear announcer",    hint: "announcer",        female: true  },
];

// Wrap raw 16-bit little-endian PCM (mono) in a WAV header so HTMLAudio can play it.
export function pcm16ToWavBlob(pcm: Uint8Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcm.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  new Uint8Array(buffer, 44).set(pcm);
  return new Blob([buffer], { type: "audio/wav" });
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Fetch a Gemini-synthesised audio URL the browser can play directly.
export async function fetchCloudTtsUrl(
  text: string,
  voiceId: string,
  lang: "ar" | "en",
  signal?: AbortSignal,
): Promise<string> {
  const r = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice: voiceId, lang }),
    signal,
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new Error(`cloud_tts_failed:${r.status}:${detail.slice(0, 120)}`);
  }
  const data = (await r.json()) as { audio: string; sampleRate?: number };
  const pcm = base64ToBytes(data.audio);
  const blob = pcm16ToWavBlob(pcm, data.sampleRate ?? 24000);
  return URL.createObjectURL(blob);
}

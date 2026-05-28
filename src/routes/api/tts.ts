import { createFileRoute } from "@tanstack/react-router";
import { getServerEnv } from "@/lib/server-env";

// Gemini 2.5 TTS preview prebuilt voice catalog. Each ID is a distinct speaker.
const GEMINI_VOICES = new Set([
  "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede",
  "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba",
  "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar",
  "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi",
  "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat",
]);

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { text?: string; voice?: string; lang?: string };
        try { body = await request.json(); } catch { return Response.json({ error: "bad_json" }, { status: 400 }); }
        const text = (body.text ?? "").toString();
        const voice = (body.voice ?? "").toString();
        const lang = body.lang === "ar" ? "ar" : "en";
        if (!text || text.length > 4000) return Response.json({ error: "invalid_text" }, { status: 400 });
        if (!GEMINI_VOICES.has(voice)) return Response.json({ error: "invalid_voice" }, { status: 400 });

        const key = getServerEnv("GEMINI_API_KEY_1") || getServerEnv("GEMINI_API_KEY_2");
        if (!key) return Response.json({ error: "no_api_key" }, { status: 503 });

        // Steer the model toward an energetic Egyptian Arabic delivery.
        const styled = lang === "ar"
          ? `تكلّم بلهجة مصرية حيوية ومرحة وواضحة، بأسلوب طبيعي ودافئ، واقرأ النص التالي كما هو دون إضافة:\n${text}`
          : `Speak naturally with a warm, bright, energetic tone:\n${text}`;

        const upstream = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${encodeURIComponent(key)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: styled }] }],
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
              },
            }),
          },
        );

        if (!upstream.ok) {
          const detail = await upstream.text();
          return Response.json(
            { error: "gemini_failed", status: upstream.status, detail: detail.slice(0, 300) },
            { status: 502 },
          );
        }

        const json = (await upstream.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }>;
        };
        const part = json?.candidates?.[0]?.content?.parts?.[0];
        const b64 = part?.inlineData?.data;
        const mime = part?.inlineData?.mimeType ?? "audio/L16;rate=24000";
        if (!b64) return Response.json({ error: "no_audio" }, { status: 502 });
        const rate = parseInt((mime.match(/rate=(\d+)/) ?? [])[1] ?? "24000", 10);
        return Response.json({ audio: b64, mimeType: mime, sampleRate: rate });
      },
    },
  },
});

import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Square, Check, Volume2, Cloud, Smartphone, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { loadVoicePrefs, saveVoicePrefs, pickBestVoice } from "@/features/chat/VoiceSettings";
import { CLOUD_AR_VOICES, CLOUD_EN_VOICES, fetchCloudTtsUrl, type CloudVoice } from "@/features/chat/CloudVoices";

const SAMPLES = {
  en: "Hello, I'm Astra. This is a quick test of my English voice — clear, calm, and natural.",
  ar: "أهلاً، أنا أسترا! ده اختبار سريع لصوتي بلهجة مصرية حيوية — واضح، دافي، وطبيعي.",
};

export function VoiceTestDialog({ appLang, trigger }: { appLang: "ar" | "en"; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [prefs, setPrefs] = useState(() => loadVoicePrefs());
  const [playingId, setPlayingId] = useState<string | null>(null); // voiceURI OR `cloud:<id>`
  const [loadingCloudId, setLoadingCloudId] = useState<string | null>(null);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const cloudAudioRef = useRef<HTMLAudioElement | null>(null);
  const cloudUrlRef = useRef<string | null>(null);
  const cloudAbortRef = useRef<AbortController | null>(null);

  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!supported || !open) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    const t = window.setTimeout(load, 250);
    window.speechSynthesis.addEventListener?.("voiceschanged", load);
    return () => {
      window.clearTimeout(t);
      window.speechSynthesis.removeEventListener?.("voiceschanged", load);
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, supported]);

  const arVoices = useMemo(() => voices.filter((v) => v.lang.toLowerCase().startsWith("ar")), [voices]);
  const enVoices = useMemo(() => voices.filter((v) => v.lang.toLowerCase().startsWith("en")), [voices]);

  const stopAll = () => {
    if (supported) {
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    }
    if (cloudAudioRef.current) {
      try { cloudAudioRef.current.pause(); } catch { /* noop */ }
      cloudAudioRef.current = null;
    }
    if (cloudUrlRef.current) {
      try { URL.revokeObjectURL(cloudUrlRef.current); } catch { /* noop */ }
      cloudUrlRef.current = null;
    }
    if (cloudAbortRef.current) {
      try { cloudAbortRef.current.abort(); } catch { /* noop */ }
      cloudAbortRef.current = null;
    }
    setPlayingId(null);
    setLoadingCloudId(null);
  };

  const testLocal = (voice: SpeechSynthesisVoice, lang: "ar" | "en") => {
    if (!supported) return;
    stopAll();
    const u = new SpeechSynthesisUtterance(SAMPLES[lang]);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 1;
    u.pitch = 1;
    u.volume = 1;
    u.onstart = () => setPlayingId(voice.voiceURI);
    u.onend = () => setPlayingId(null);
    u.onerror = () => setPlayingId(null);
    utterRef.current = u;
    window.setTimeout(() => window.speechSynthesis.speak(u), 60);
  };

  const testCloud = async (voice: CloudVoice, lang: "ar" | "en") => {
    stopAll();
    const id = `cloud:${voice.id}:${lang}`;
    setLoadingCloudId(id);
    const ac = new AbortController();
    cloudAbortRef.current = ac;
    try {
      const url = await fetchCloudTtsUrl(SAMPLES[lang], voice.id, lang, ac.signal);
      if (ac.signal.aborted) { URL.revokeObjectURL(url); return; }
      cloudUrlRef.current = url;
      const audio = new Audio(url);
      cloudAudioRef.current = audio;
      audio.onplay = () => { setLoadingCloudId(null); setPlayingId(id); };
      audio.onended = () => { setPlayingId(null); };
      audio.onerror = () => { setPlayingId(null); setLoadingCloudId(null); };
      await audio.play();
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setLoadingCloudId(null);
      setPlayingId(null);
      // eslint-disable-next-line no-console
      console.error("Cloud TTS failed:", err);
    }
  };

  const selectLocal = (voice: SpeechSynthesisVoice, lang: "ar" | "en") => {
    // Picking a local voice clears any cloud override for that language.
    const patch = lang === "ar"
      ? { arVoiceURI: voice.voiceURI, arCloudVoice: null }
      : { enVoiceURI: voice.voiceURI, enCloudVoice: null };
    saveVoicePrefs(patch);
    setPrefs((p) => ({ ...p, ...patch }));
  };

  const selectCloud = (voice: CloudVoice, lang: "ar" | "en") => {
    const patch = lang === "ar" ? { arCloudVoice: voice.id } : { enCloudVoice: voice.id };
    saveVoicePrefs(patch);
    setPrefs((p) => ({ ...p, ...patch }));
  };

  const togglePreferFemale = (v: boolean) => {
    saveVoicePrefs({ preferFemale: v });
    setPrefs((p) => ({ ...p, preferFemale: v }));
  };

  const renderLocal = (list: SpeechSynthesisVoice[], lang: "ar" | "en") => {
    const selectedURI = lang === "ar" ? prefs.arVoiceURI : prefs.enVoiceURI;
    const cloudActive = !!(lang === "ar" ? prefs.arCloudVoice : prefs.enCloudVoice);
    const auto = pickBestVoice(voices, lang, prefs);
    if (list.length === 0) {
      return (
        <p className="px-2 py-3 text-xs text-muted-foreground">
          {appLang === "ar"
            ? `لا توجد أصوات ${lang === "ar" ? "عربية" : "إنجليزية"} مثبّتة على هذا الجهاز.`
            : `No ${lang === "ar" ? "Arabic" : "English"} voices on this device.`}
        </p>
      );
    }
    return (
      <ul className="space-y-1.5">
        {list.map((v) => {
          const isPlaying = playingId === v.voiceURI;
          const isSelected = !cloudActive && (selectedURI === v.voiceURI || (!selectedURI && auto?.voiceURI === v.voiceURI));
          return (
            <li
              key={v.voiceURI}
              className={`flex items-center gap-2 rounded-lg border px-2 py-2 ${
                isSelected ? "border-primary/60 bg-primary/5" : "border-border/60"
              }`}
            >
              <Button
                type="button"
                size="icon"
                variant={isPlaying ? "secondary" : "ghost"}
                onClick={() => (isPlaying ? stopAll() : testLocal(v, lang))}
                aria-label={isPlaying ? "Stop" : "Test"}
                className="h-9 w-9 shrink-0 sm:h-8 sm:w-8"
              >
                {isPlaying ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </Button>
              <div className="min-w-0 flex-1 overflow-x-auto">
                <div className="whitespace-nowrap text-sm font-medium">{v.name}</div>
                <div className="whitespace-nowrap text-[11px] text-muted-foreground">
                  <Smartphone className="me-1 inline h-3 w-3" />
                  {v.lang}
                  {v.localService ? " · local" : " · cloud"}
                  {!selectedURI && !cloudActive && auto?.voiceURI === v.voiceURI ? (appLang === "ar" ? " · افتراضي" : " · auto") : ""}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant={isSelected ? "default" : "outline"}
                onClick={() => selectLocal(v, lang)}
                className="h-9 shrink-0 px-3 sm:h-8"
              >
                {isSelected ? <Check className="h-3.5 w-3.5" /> : appLang === "ar" ? "اختر" : "Use"}
              </Button>
            </li>
          );
        })}
      </ul>
    );
  };

  const renderCloud = (list: CloudVoice[], lang: "ar" | "en") => {
    const selectedCloudId = lang === "ar" ? prefs.arCloudVoice : prefs.enCloudVoice;
    return (
      <ul className="space-y-1.5">
        {list.map((v) => {
          const id = `cloud:${v.id}:${lang}`;
          const isPlaying = playingId === id;
          const isLoading = loadingCloudId === id;
          const isSelected = selectedCloudId === v.id;
          return (
            <li
              key={id}
              className={`flex items-center gap-2 rounded-lg border px-2 py-2 ${
                isSelected ? "border-primary/60 bg-primary/5" : "border-border/60"
              }`}
            >
              <Button
                type="button"
                size="icon"
                variant={isPlaying ? "secondary" : "ghost"}
                onClick={() => (isPlaying ? stopAll() : testCloud(v, lang))}
                disabled={isLoading}
                aria-label={isPlaying ? "Stop" : "Test"}
                className="h-9 w-9 shrink-0 sm:h-8 sm:w-8"
              >
                {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                  isPlaying ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </Button>
              <div className="min-w-0 flex-1 overflow-x-auto">
                <div className="whitespace-nowrap text-sm font-medium">{v.label}</div>
                <div className="whitespace-nowrap text-[11px] text-muted-foreground">
                  <Cloud className="me-1 inline h-3 w-3" />
                  Gemini · {v.hint}
                  {lang === "ar" ? " · لهجة مصرية" : ""}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant={isSelected ? "default" : "outline"}
                onClick={() => selectCloud(v, lang)}
                className="h-9 shrink-0 px-3 sm:h-8"
              >
                {isSelected ? <Check className="h-3.5 w-3.5" /> : appLang === "ar" ? "اختر" : "Use"}
              </Button>
            </li>
          );
        })}
      </ul>
    );
  };

  // Mobile-friendly scrollable column. Vertical scroll for the list,
  // horizontal scroll inside each row for long voice names.
  const Column = ({ title, children }: { title: React.ReactNode; children: React.ReactNode }) => (
    <section className="flex min-w-0 flex-col">
      <h3 className="mb-1.5 text-sm font-semibold">{title}</h3>
      <div className="max-h-[40vh] min-h-[140px] overflow-y-auto overflow-x-hidden rounded-md border border-border/60 p-2 sm:max-h-72">
        {children}
      </div>
    </section>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) stopAll();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="flex max-h-[92vh] w-[96vw] max-w-3xl flex-col gap-3 overflow-hidden p-3 sm:p-6"
        dir={appLang === "ar" ? "rtl" : "ltr"}
      >
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-base sm:text-lg">{appLang === "ar" ? "اختبر أصواتك" : "Test my voices"}</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {appLang === "ar"
              ? "أصوات الجهاز محلية ومجانية، والسحابية بلهجة مصرية حيوية عبر Gemini. اضغط ▶ للتجربة و اختر للاستخدام."
              : "Device voices are local & free. Cloud voices use Gemini — Arabic ones speak in an energetic Egyptian accent. Tap ▶ to preview, then Use to pick."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-lg border border-border/60 p-2">
          <div className="flex items-center gap-2 text-sm">
            <Volume2 className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="prefer-female">{appLang === "ar" ? "تفضيل صوت أنثوي" : "Prefer female voice"}</Label>
          </div>
          <Switch id="prefer-female" checked={prefs.preferFemale} onCheckedChange={togglePreferFemale} />
        </div>

        {/* Scrollable body — both axes on mobile, two columns on desktop */}
        <div className="-mx-1 flex-1 overflow-y-auto overflow-x-auto px-1">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <Column title={
                <span className="flex items-center gap-2">
                  <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
                  {appLang === "ar" ? "أصوات عربية — الجهاز" : "Arabic — device voices"}
                </span>
              }>
                {renderLocal(arVoices, "ar")}
              </Column>
              <Column title={
                <span className="flex items-center gap-2">
                  <Cloud className="h-3.5 w-3.5 text-sky-400" />
                  {appLang === "ar" ? "أصوات عربية — سحابية (مصرية)" : "Arabic — cloud (Egyptian)"}
                </span>
              }>
                {renderCloud(CLOUD_AR_VOICES, "ar")}
              </Column>
            </div>
            <div className="space-y-3">
              <Column title={
                <span className="flex items-center gap-2">
                  <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
                  {appLang === "ar" ? "أصوات إنجليزية — الجهاز" : "English — device voices"}
                </span>
              }>
                {renderLocal(enVoices, "en")}
              </Column>
              <Column title={
                <span className="flex items-center gap-2">
                  <Cloud className="h-3.5 w-3.5 text-sky-400" />
                  {appLang === "ar" ? "أصوات إنجليزية — سحابية" : "English — cloud"}
                </span>
              }>
                {renderCloud(CLOUD_EN_VOICES, "en")}
              </Column>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="secondary" onClick={() => setOpen(false)} className="w-full sm:w-auto">
            {appLang === "ar" ? "تم" : "Done"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

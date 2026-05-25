import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Download, Trash2, ShieldCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";

// Session-only keys (legacy + ephemeral chat state).
const SESSION_KEYS = ["astra:session-chats", "astra:session-tasks", "astra:session-memories"];
// Persistent localStorage keys (current architecture).
const LOCAL_KEYS = ["astra:tasks-v1", "astra:memories-v2", "astra-voice-prefs-v1", "astra:chat-first-msg-at", "astra:retention-banner-dismissed-cycle"];

export function SettingsPage() {
  const { t, lang, setLang } = useI18n();

  const exportData = () => {
    const out: Record<string, unknown> = {};
    for (const k of SESSION_KEYS) {
      try { out[k] = JSON.parse(sessionStorage.getItem(k) || "null"); } catch { out[k] = null; }
    }
    for (const k of LOCAL_KEYS) {
      try { out[k] = JSON.parse(localStorage.getItem(k) || "null"); } catch { out[k] = null; }
    }
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `astra-export-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
    toast.success(lang === "ar" ? "تم التصدير" : "Exported");
  };

  const deleteAll = () => {
    if (!confirm(lang === "ar" ? "حذف كل بياناتك (المحادثات والمهام والذكريات)؟" : "Delete all your data (chats, tasks, memories)?")) return;
    for (const k of SESSION_KEYS) sessionStorage.removeItem(k);
    for (const k of LOCAL_KEYS) localStorage.removeItem(k);
    toast.success(lang === "ar" ? "تم الحذف" : "All data deleted");
    setTimeout(() => window.location.reload(), 600);
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">{t("settings")}</h1>

      <div className="space-y-6">
        <div className="rounded-2xl glass-strong p-5">
          <h2 className="mb-4 text-lg font-semibold">{lang === "ar" ? "عام" : "General"}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("language")}</Label>
              <Select value={lang} onValueChange={(v) => setLang(v as "en" | "ar")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ar">العربية</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="rounded-2xl glass-strong p-5">
          <h2 className="mb-2 text-lg font-semibold">{lang === "ar" ? "الخصوصية" : "Privacy"}</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {lang === "ar"
              ? "بياناتك محفوظة محليًا في هذا المتصفح وتبقى بين الجلسات. يمكنك تصديرها أو حذفها يدويًا في أي وقت، وقد تُحذف تلقائيًا إذا فعّل المشرف سياسة الاحتفاظ."
              : "Your data is stored locally in this browser and persists across sessions. You can export or delete it anytime, and it may be auto-deleted if the admin enables the retention policy."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={exportData} variant="outline"><Download className="me-2 h-4 w-4" />{t("exportData")}</Button>
            <Button onClick={deleteAll} variant="destructive"><Trash2 className="me-2 h-4 w-4" />{t("deleteAllData")}</Button>
          </div>
        </div>

        <div className="rounded-2xl glass-strong p-5 text-sm text-muted-foreground">
          <div className="mb-1 font-semibold text-foreground">{lang === "ar" ? "الدعم الفني" : "Technical Support"}</div>
          <div>GX TEAM — <a href="tel:01095777037" className="text-electric hover:underline">01095777037</a></div>
        </div>

        <div className="rounded-2xl glass-strong p-5">
          <div className="mb-1 font-semibold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-electric" />
            {lang === "ar" ? "لوحة تحكم GX" : "GX Control Panel"}
          </div>
          <p className="mb-3 text-sm text-muted-foreground">
            {lang === "ar"
              ? "للمشرف فقط — يتطلب كلمة المرور."
              : "Admin only — password required."}
          </p>
          <Button asChild variant="outline">
            <Link to="/gx-control">
              <ShieldCheck className="me-2 h-4 w-4" />
              {lang === "ar" ? "افتح لوحة GX" : "Open GX Control"}
            </Link>
          </Button>
        </div>

      </div>
    </div>
  );
}

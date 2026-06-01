import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { BookOpen, Phone, Sparkles, ScrollText } from "lucide-react";

const SUPPORT_PHONE = "01095777037";

export function GuidePage() {
  const { lang } = useI18n();
  const [mode, setMode] = useState<"quick" | "full">("quick");
  const isAr = lang === "ar";

  const tabLabel = (q: string, f: string) => ({ quick: q, full: f });
  const tabs = isAr
    ? tabLabel("سريع", "تفصيلي")
    : tabLabel("Quick", "Detailed");

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <BookOpen className="h-7 w-7 text-electric" />
        <h1 className="text-3xl font-semibold tracking-tight">
          {isAr ? "دليل استخدام أسترا" : "Astra User Guide"}
        </h1>
      </div>

      <div className="mb-6 inline-flex rounded-xl border border-border bg-card p-1">
        <Button
          size="sm"
          variant={mode === "quick" ? "default" : "ghost"}
          onClick={() => setMode("quick")}
          className={mode === "quick" ? "glow-electric" : ""}
        >
          <Sparkles className="me-1 h-4 w-4" />
          {tabs.quick}
        </Button>
        <Button
          size="sm"
          variant={mode === "full" ? "default" : "ghost"}
          onClick={() => setMode("full")}
          className={mode === "full" ? "glow-electric" : ""}
        >
          <ScrollText className="me-1 h-4 w-4" />
          {tabs.full}
        </Button>
      </div>

      {mode === "quick" ? (
        <div className="space-y-4">
          <GuideCard title={isAr ? "المحادثة" : "Chat"}>
            {isAr
              ? "اكتب رسالة وأرسلها بزر الإرسال. على الموبايل زر Enter يضيف سطر جديد فقط."
              : "Type a message and tap Send. On mobile, Enter only adds a new line."}
          </GuideCard>
          <GuideCard title={isAr ? "الصوت" : "Voice"}>
            {isAr
              ? "اضغط زر المايك للتحدث، وزر السماعة لجعل أسترا يقرأ الرد بصوته."
              : "Tap the mic to talk, tap the speaker to hear Astra read replies aloud."}
          </GuideCard>
          <GuideCard title={isAr ? "المهام" : "Tasks"}>
            {isAr
              ? "أضف مهمة باختيار أولوية. يمكنك تعديل أو حذف أي مهمة من زر القلم أو الحذف."
              : "Add a task with a priority. Edit or delete any task using the pencil/trash buttons."}
          </GuideCard>
          <GuideCard title={isAr ? "الذاكرة" : "Memories"}>
            {isAr
              ? "كل ما تضيفه أو يلاحظه أسترا عنك يُحفظ هنا. عدّل أو احذف أي ذاكرة في أي وقت."
              : "Anything you add or Astra learns about you lives here. Edit or remove memories anytime."}
          </GuideCard>
          <GuideCard title={isAr ? "المظهر واللغة" : "Theme & Language"}>
            {isAr
              ? "من الإعدادات بدّل بين الأزرق والبنفسجي، وبين العربية والإنجليزية."
              : "From Settings, switch between blue/purple themes and English/Arabic."}
          </GuideCard>
          <SupportCard isAr={isAr} />
        </div>
      ) : (
        <div className="space-y-6">
          <FullSection title={isAr ? "1. المحادثة مع أسترا" : "1. Chatting with Astra"}>
            {isAr ? (
              <>
                <p>اكتب أي شيء بالعربية أو الإنجليزية أو حتى لهجة محلية مختلطة — أسترا يفهم.</p>
                <ul className="list-disc ps-5 space-y-1">
                  <li>على الكمبيوتر: Enter يرسل، Shift+Enter يضيف سطر جديد.</li>
                  <li>على الموبايل: Enter يضيف سطر جديد فقط — اضغط زر الإرسال.</li>
                  <li>يمكنك إيقاف الرد في أي وقت بزر الإيقاف.</li>
                </ul>
              </>
            ) : (
              <>
                <p>Write anything in Arabic, English, or a mixed dialect — Astra understands.</p>
                <ul className="list-disc ps-5 space-y-1">
                  <li>Desktop: Enter sends, Shift+Enter adds a new line.</li>
                  <li>Mobile: Enter only adds a new line — use the Send button.</li>
                  <li>Stop a reply at any time with the Stop button.</li>
                </ul>
              </>
            )}
          </FullSection>

          <FullSection title={isAr ? "2. الصوت (إدخال وإخراج)" : "2. Voice (input & output)"}>
            {isAr ? (
              <>
                <p>اضغط زر المايك ليسمعك أسترا ويحوّل كلامك إلى نص. اضغط زر السماعة ليقرأ الرد بصوته.</p>
                <p>إذا لم يعمل الصوت العربي السحابي، افتح إعدادات هاتفك ← اللغة والإدخال ← مخرجات تحويل النص إلى كلام ← Google ← ثبّت اللغة العربية، ثم اختر صوتًا محليًا من "اختبار الأصوات".</p>
                <p>الردود الطويلة تُقسَّم تلقائيًا لتُقرأ كاملة بدون انقطاع، حتى لو وضعت الهاتف في الخلفية لفترة قصيرة.</p>
              </>
            ) : (
              <>
                <p>Tap the mic button so Astra hears you and transcribes your speech. Tap the speaker so Astra reads replies aloud.</p>
                <p>If cloud Arabic voices stop working, open your phone Settings → Languages &amp; input → Text-to-speech output → Google → install Arabic, then pick a local voice from "Test my voices".</p>
                <p>Long replies are split into chunks automatically so the entire message is read, even if you briefly background the app.</p>
              </>
            )}
          </FullSection>

          <FullSection title={isAr ? "3. المهام" : "3. Tasks"}>
            {isAr ? (
              <>
                <p>أضف عنوانًا، وصفًا، وأولوية (منخفضة، متوسطة، عالية، عاجلة). أسترا يرى مهامك ويرتبها حسب الأولوية في ردوده.</p>
                <ul className="list-disc ps-5 space-y-1">
                  <li>اضغط المربع لتحديد المهمة كمنجزة.</li>
                  <li>زر القلم لتعديل العنوان والوصف والأولوية.</li>
                  <li>زر الحذف لإزالة المهمة نهائيًا.</li>
                </ul>
              </>
            ) : (
              <>
                <p>Add a title, description, and priority (low, medium, high, urgent). Astra sees your tasks and references them in replies sorted by urgency.</p>
                <ul className="list-disc ps-5 space-y-1">
                  <li>Tap the checkbox to mark a task done.</li>
                  <li>Pencil icon to edit the title, description, or priority.</li>
                  <li>Trash icon to remove the task permanently.</li>
                </ul>
              </>
            )}
          </FullSection>

          <FullSection title={isAr ? "4. الذاكرة" : "4. Memories"}>
            {isAr ? (
              <>
                <p>الذاكرة نوعان:</p>
                <ul className="list-disc ps-5 space-y-1">
                  <li><b>يدوية:</b> تضيفها أنت — مثل تفضيلاتك، أرقام مهمة، أو سياق دائم.</li>
                  <li><b>تلقائية:</b> يلتقطها أسترا من محادثاتك (اسمك، مكانك، ما تحبه).</li>
                </ul>
                <p>عدّل أي ذاكرة بزر القلم، أو احذفها بزر السلة. كل شيء محفوظ في متصفحك فقط.</p>
              </>
            ) : (
              <>
                <p>Two kinds of memories:</p>
                <ul className="list-disc ps-5 space-y-1">
                  <li><b>Manual:</b> you add them — preferences, key numbers, persistent context.</li>
                  <li><b>Auto:</b> Astra extracts from chat (your name, location, likes).</li>
                </ul>
                <p>Edit any memory with the pencil button, delete with the trash button. Everything stays in your browser only.</p>
              </>
            )}
          </FullSection>

          <FullSection title={isAr ? "5. الإعدادات والمظهر" : "5. Settings & Theme"}>
            {isAr
              ? "من صفحة الإعدادات يمكنك تغيير اللغة (عربي/إنجليزي)، اللون الأساسي (أزرق أو بنفسجي)، والتحكم في إعدادات الصوت."
              : "From Settings, change language (Arabic/English), primary color (blue or purple), and tweak voice options."}
          </FullSection>

          <FullSection title={isAr ? "6. الخصوصية" : "6. Privacy"}>
            {isAr
              ? "كل مهامك وذكرياتك محفوظة محليًا في متصفحك فقط. لن تُرسل لأي خادم خارجي إلا لما يحتاج أسترا أن يجيب على رسالتك."
              : "All your tasks and memories live in your browser only. Nothing is sent to a server except what Astra needs to answer your message."}
          </FullSection>

          <SupportCard isAr={isAr} />
        </div>
      )}
    </div>
  );
}

function GuideCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl glass p-4">
      <h3 className="mb-1 text-sm font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}

function FullSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl glass-strong p-5">
      <h2 className="mb-3 text-lg font-semibold tracking-tight">{title}</h2>
      <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

function SupportCard({ isAr }: { isAr: boolean }) {
  return (
    <div className="mt-2 rounded-2xl border border-electric/30 bg-electric/5 p-5">
      <div className="mb-2 flex items-center gap-2">
        <Phone className="h-5 w-5 text-electric" />
        <h3 className="text-base font-semibold">
          {isAr ? "الدعم الفني" : "Technical Support"}
        </h3>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        {isAr
          ? "لأي مشكلة أو استفسار، تواصل مع فريق GX على الرقم:"
          : "For any issue or question, contact the GX team at:"}
      </p>
      <a
        href={`tel:${SUPPORT_PHONE}`}
        className="inline-flex items-center gap-2 rounded-xl bg-electric px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90"
      >
        <Phone className="h-4 w-4" />
        {SUPPORT_PHONE}
      </a>
    </div>
  );
}

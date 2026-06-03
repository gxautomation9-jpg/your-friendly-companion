import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Brain, Check, Pencil, Plus, Sparkles, Trash2, User, Wand2, X } from "lucide-react";
import { addManualMemory, clearAuto, deleteMemory, listMemories, updateMemory, type Memory } from "@/lib/astra-memory";

export function MemoriesPage() {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<Memory[]>([]);
  const [category, setCategory] = useState("note");
  const [content, setContent] = useState("");

  const [editId, setEditId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState("");
  const [editContent, setEditContent] = useState("");

  useEffect(() => { setItems(listMemories()); }, []);
  const refresh = () => setItems(listMemories());

  const add = () => {
    if (!content.trim()) return;
    addManualMemory(category, content);
    setContent("");
    refresh();
  };
  const del = (id: string) => { deleteMemory(id); refresh(); };
  const clearAutoFacts = () => { clearAuto(); refresh(); };

  const startEdit = (m: Memory) => {
    setEditId(m.id);
    setEditCategory(m.category);
    setEditContent(m.content);
  };
  const cancelEdit = () => setEditId(null);
  const saveEdit = () => {
    if (!editId) return;
    updateMemory(editId, { category: editCategory, content: editContent });
    setEditId(null);
    refresh();
  };

  const autoCount = items.filter((m) => m.kind === "auto").length;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <Brain className="h-7 w-7 text-electric" />
        <h1 className="text-3xl font-semibold tracking-tight">{t("memories")}</h1>
      </div>
      <div className="mb-4 rounded-md border border-electric/20 bg-electric/5 p-3 text-xs leading-snug text-muted-foreground">
        {lang === "ar"
          ? "ذكرياتك محفوظة محليًا في متصفحك وتبقى بين الجلسات. أسترا تستخدمها لتفهمك بشكل أفضل."
          : "Your memories are stored locally in your browser and persist across sessions. Astra uses them to understand you better."}
      </div>

      <div className="mb-8 rounded-2xl glass-strong p-4">
        <div className="grid gap-3 sm:grid-cols-[160px_1fr_auto]">
          <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={lang === "ar" ? "التصنيف" : "Category"} />
          <Input value={content} onChange={(e) => setContent(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={lang === "ar" ? "اكتب الذاكرة…" : "Write a memory…"} />
          <Button onClick={add} disabled={!content.trim()} className="glow-electric"><Plus className="me-1 h-4 w-4" />{t("addMemory")}</Button>
        </div>
      </div>

      {autoCount > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-dashed border-muted-foreground/20 px-4 py-2 text-xs text-muted-foreground">
          <span>{lang === "ar" ? `${autoCount} ذكرى تعلمتها أسترا تلقائيًا` : `${autoCount} facts Astra learned automatically`}</span>
          <button onClick={clearAutoFacts} className="text-destructive hover:underline">
            {lang === "ar" ? "مسح الذكريات التلقائية" : "Clear auto memories"}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {items.length === 0 && (
          <div className="rounded-2xl glass p-12 text-center text-muted-foreground">
            {lang === "ar" ? "لا توجد ذكريات بعد." : "No memories yet."}
          </div>
        )}
        {items.map((m) => {
          const isEditing = editId === m.id;
          return (
            <div key={m.id} className="flex items-start gap-3 rounded-xl glass p-4">
              <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium ${
                m.kind === "ai"
                  ? "bg-electric/20 text-electric ring-1 ring-electric/40"
                  : m.kind === "auto"
                    ? "bg-electric/15 text-electric"
                    : "bg-primary/15 text-primary"
              }`}>
                {m.kind === "ai" ? <Wand2 className="h-3 w-3" /> : m.kind === "auto" ? <Sparkles className="h-3 w-3" /> : <User className="h-3 w-3" />}
                {isEditing ? null : (m.kind === "ai" ? (lang === "ar" ? "أسترا" : "Astra") : m.category)}
              </span>
              <div className="min-w-0 flex-1">
                {isEditing ? (
                  <div className="space-y-2">
                    <Input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} placeholder={lang === "ar" ? "التصنيف" : "Category"} />
                    <Input value={editContent} onChange={(e) => setEditContent(e.target.value)} placeholder={lang === "ar" ? "المحتوى" : "Content"} />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" onClick={saveEdit} className="glow-electric"><Check className="me-1 h-3.5 w-3.5" />{t("save")}</Button>
                      <Button size="sm" variant="ghost" onClick={cancelEdit}><X className="me-1 h-3.5 w-3.5" />{t("cancel")}</Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm whitespace-pre-wrap">{m.content}</div>
                )}
              </div>
              {!isEditing && (
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => startEdit(m)} className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={t("edit")}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => del(m.id)} className="rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive" aria-label={t("delete")}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

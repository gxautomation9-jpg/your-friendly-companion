import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  listTasks,
  addTask as addTaskStore,
  toggleTask as toggleTaskStore,
  deleteTask as deleteTaskStore,
  updateTask as updateTaskStore,
  type Task,
  type Priority,
} from "@/lib/astra-tasks";

export function TasksPage() {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");

  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPriority, setEditPriority] = useState<Priority>("medium");

  useEffect(() => { setItems(listTasks()); }, []);
  const refresh = () => setItems(listTasks());

  useEffect(() => {
    const onUpdate = () => refresh();
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === "astra:tasks-v1") refresh();
    };

    window.addEventListener("astra:tasks-updated", onUpdate);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("astra:tasks-updated", onUpdate);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const add = () => {
    if (!title.trim()) return;
    addTaskStore({ title, description: desc, priority });
    setTitle(""); setDesc(""); setPriority("medium");
    refresh();
  };
  const toggle = (id: string) => { toggleTaskStore(id); refresh(); };
  const del = (id: string) => { deleteTaskStore(id); refresh(); };

  const startEdit = (task: Task) => {
    setEditId(task.id);
    setEditTitle(task.title);
    setEditDesc(task.description ?? "");
    setEditPriority(task.priority);
  };
  const cancelEdit = () => setEditId(null);
  const saveEdit = () => {
    if (!editId) return;
    updateTaskStore(editId, { title: editTitle, description: editDesc, priority: editPriority });
    setEditId(null);
    refresh();
  };

  const priorityColor = (p: Priority) =>
    p === "urgent" ? "bg-destructive/20 text-destructive" : p === "high" ? "bg-electric/20 text-electric" : p === "medium" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground";

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">{t("tasks")}</h1>
      <div className="mb-4 rounded-md border border-electric/20 bg-electric/5 p-3 text-xs leading-snug text-muted-foreground">
        {lang === "ar"
          ? "مهامك محفوظة محليًا في متصفحك وتبقى بين الجلسات حتى لو أغلقت Chrome."
          : "Your tasks are stored locally in your browser and persist across sessions — even after closing Chrome."}
      </div>

      <div className="mb-8 rounded-2xl glass-strong p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <Input placeholder={t("title")} value={title} onChange={(e) => setTitle(e.target.value)} />
          <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["low","medium","high","urgent"] as const).map(p => <SelectItem key={p} value={p}>{t(p)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={add} disabled={!title.trim()} className="glow-electric"><Plus className="me-1 h-4 w-4" />{t("addTask")}</Button>
        </div>
        <Textarea placeholder={t("description")} value={desc} onChange={(e) => setDesc(e.target.value)} className="mt-3" rows={2} />
      </div>

      <div className="space-y-2">
        {items.length === 0 && (
          <div className="rounded-2xl glass p-12 text-center text-muted-foreground">
            {lang === "ar" ? "لا توجد مهام بعد. أضف أول مهمة بالأعلى." : "No tasks yet. Add your first one above."}
          </div>
        )}
        {items.map((task) => {
          const isEditing = editId === task.id;
          return (
            <div key={task.id} className="flex items-start gap-3 rounded-xl glass p-4 transition hover:border-electric/30">
              <button onClick={() => toggle(task.id)} className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${task.status === "done" ? "bg-electric border-electric" : "border-border"}`}>
                {task.status === "done" && <Check className="h-3.5 w-3.5 text-background" />}
              </button>
              <div className="min-w-0 flex-1">
                {isEditing ? (
                  <div className="space-y-2">
                    <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder={t("title")} />
                    <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder={t("description")} rows={2} />
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={editPriority} onValueChange={(v) => setEditPriority(v as Priority)}>
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(["low","medium","high","urgent"] as const).map(p => <SelectItem key={p} value={p}>{t(p)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button size="sm" onClick={saveEdit} className="glow-electric"><Check className="me-1 h-3.5 w-3.5" />{t("save")}</Button>
                      <Button size="sm" variant="ghost" onClick={cancelEdit}><X className="me-1 h-3.5 w-3.5" />{t("cancel")}</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={`text-sm font-medium ${task.status === "done" ? "text-muted-foreground line-through" : ""}`}>{task.title}</div>
                    {task.description && <div className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{task.description}</div>}
                    <span className={`mt-2 inline-block rounded-md px-2 py-0.5 text-xs ${priorityColor(task.priority)}`}>{t(task.priority)}</span>
                  </>
                )}
              </div>
              {!isEditing && (
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => startEdit(task)} className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={t("edit")}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => del(task.id)} className="rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive" aria-label={t("delete")}>
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

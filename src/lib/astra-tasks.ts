// Astra persistent tasks store.
// Uses localStorage so tasks survive browser restarts (not just tabs).
// Resilient to SSR and storage quota errors.

export type Priority = "low" | "medium" | "high" | "urgent";
export type Status = "todo" | "done";
export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: Status;
  priority: Priority;
  created_at: string;
};

const KEY = "astra:tasks-v1";
const LEGACY_KEY = "astra:session-tasks";

function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `t_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function listTasks(): Task[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Task[];
    // One-time migration from the old sessionStorage key.
    try {
      const legacy = sessionStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const items = JSON.parse(legacy) as Task[];
        localStorage.setItem(KEY, JSON.stringify(items));
        sessionStorage.removeItem(LEGACY_KEY);
        return items;
      }
    } catch { /* ignore */ }
    return [];
  } catch {
    return [];
  }
}

function persist(items: Task[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* quota */ }
}

export function saveTasks(items: Task[]) { persist(items); }

export function addTask(input: { title: string; description?: string | null; priority?: Priority }): Task {
  const items = listTasks();
  const task: Task = {
    id: uid(),
    title: input.title.trim(),
    description: input.description?.trim() || null,
    status: "todo",
    priority: input.priority ?? "medium",
    created_at: new Date().toISOString(),
  };
  persist([task, ...items]);
  return task;
}

export function toggleTask(id: string) {
  persist(listTasks().map((t) => (t.id === id ? { ...t, status: t.status === "done" ? "todo" : "done" } : t)));
}

export function deleteTask(id: string) {
  persist(listTasks().filter((t) => t.id !== id));
}

export function clearAllTasks() {
  if (typeof window !== "undefined") localStorage.removeItem(KEY);
}

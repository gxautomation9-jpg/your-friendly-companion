// Parses and executes hidden action tags emitted by Astra inside chat replies.
//
// Tag format (one JSON object per tag):
//   [[ASTRA_ACTION]]{"type":"task.add","title":"...","priority":"medium","description":"..."}[[/ASTRA_ACTION]]
//
// Supported types:
//   task.add      { title, priority?, description? }
//   task.check    { match }                       // mark a task done (by id or title substring)
//   task.uncheck  { match }                       // mark a task back to todo
//   task.edit     { match, title?, priority?, description? }
//   task.delete   { match }
//   memory.save   { category?, content }          // saved as kind="ai"
//   memory.delete { match }                       // delete by id or content substring

import {
  addTask, deleteTask, listTasks, toggleTask, updateTask, type Priority,
} from "@/lib/astra-tasks";
import {
  addAiMemory, deleteMemory, listMemories,
} from "@/lib/astra-memory";

export const ACTION_TAG_RE = /\[\[ASTRA_ACTION\]\]\s*([\s\S]*?)\s*\[\[\/ASTRA_ACTION\]\]/g;

export function stripActionTags(text: string): string {
  return text.replace(ACTION_TAG_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

type ActionResult = { ok: boolean; type: string; note?: string };

function findTasksByMatch(match: string) {
  if (!match) return [];
  const items = listTasks();
  const byId = items.filter((t) => t.id === match);
  if (byId.length) return byId;
  const m = match.trim().toLowerCase();
  const exact = items.filter((t) => t.title.trim().toLowerCase() === m);
  if (exact.length) return exact;
  const startsWith = items.filter((t) => t.title.trim().toLowerCase().startsWith(m));
  if (startsWith.length) return startsWith;
  return items.filter((t) => t.title.toLowerCase().includes(m));
}

function findTaskByMatch(match: string) {
  return findTasksByMatch(match)[0] ?? null;
}

function normalizePriority(p: unknown): Priority | undefined {
  if (p === "low" || p === "medium" || p === "high" || p === "urgent") return p;
  return undefined;
}

function runOne(action: { type?: string } & Record<string, unknown>): ActionResult {
  const type = String(action.type || "");
  try {
    switch (type) {
      case "task.add": {
        const title = String(action.title || "").trim();
        if (!title) return { ok: false, type, note: "missing title" };
        const description = typeof action.description === "string" ? action.description.trim() : "";
        const duplicate = listTasks().find((task) =>
          task.status === "todo"
          && task.title.trim().toLowerCase() === title.toLowerCase()
          && (task.description ?? "").trim().toLowerCase() === description.toLowerCase(),
        );
        if (duplicate) return { ok: true, type, note: "duplicate skipped" };
        addTask({
          title,
          description: description || null,
          priority: normalizePriority(action.priority) ?? "medium",
        });
        return { ok: true, type };
      }
      case "task.check":
      case "task.uncheck": {
        const target = findTaskByMatch(String(action.match || action.title || ""));
        if (!target) return { ok: false, type, note: "task not found" };
        const wantDone = type === "task.check";
        if ((target.status === "done") !== wantDone) toggleTask(target.id);
        return { ok: true, type };
      }
      case "task.edit": {
        const target = findTaskByMatch(String(action.match || ""));
        if (!target) return { ok: false, type, note: "task not found" };
        updateTask(target.id, {
          title: typeof action.title === "string" ? action.title : undefined,
          description: typeof action.description === "string" ? action.description : undefined,
          priority: normalizePriority(action.priority),
        });
        return { ok: true, type };
      }
      case "task.delete": {
        const targets = findTasksByMatch(String(action.match || action.title || ""));
        if (targets.length === 0) return { ok: false, type, note: "task not found" };
        for (const target of targets) deleteTask(target.id);
        return { ok: true, type };
      }
      case "memory.save": {
        const content = String(action.content || "").trim();
        if (!content) return { ok: false, type, note: "missing content" };
        const category = String(action.category || "preference").trim() || "preference";
        addAiMemory(category, content);
        return { ok: true, type };
      }
      case "memory.delete": {
        const match = String(action.match || "").trim();
        if (!match) return { ok: false, type, note: "missing match" };
        const items = listMemories();
        const byId = items.find((m) => m.id === match);
        const target = byId ?? items.find((m) => m.content.toLowerCase().includes(match.toLowerCase()));
        if (!target) return { ok: false, type, note: "memory not found" };
        deleteMemory(target.id);
        return { ok: true, type };
      }
      default:
        return { ok: false, type, note: "unknown action" };
    }
  } catch (e) {
    return { ok: false, type, note: e instanceof Error ? e.message : "error" };
  }
}

export function executeActionsInText(text: string): ActionResult[] {
  const results: ActionResult[] = [];
  if (!text) return results;
  const matches = text.matchAll(ACTION_TAG_RE);
  for (const m of matches) {
    const payload = m[1]?.trim();
    if (!payload) continue;
    try {
      const obj = JSON.parse(payload);
      if (Array.isArray(obj)) {
        for (const a of obj) results.push(runOne(a));
      } else if (obj && typeof obj === "object") {
        results.push(runOne(obj));
      }
    } catch {
      // ignore malformed JSON
    }
  }
  return results;
}

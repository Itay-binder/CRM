"use client";

import { useEffect, useMemo, useState } from "react";

type TaskStatus = "todo" | "in_progress" | "done";
type TaskComment = { id: string; text: string; createdAt: string };
type Task = {
  id: string;
  title: string;
  dueAt: string;
  status: TaskStatus;
  done: boolean;
  comments: TaskComment[];
  assignedRep?: string;
  entityType: "contact" | "opportunity";
  entityId: string;
  entityName: string;
  createdAt: string;
};

const COLUMNS: Array<{ id: TaskStatus; label: string }> = [
  { id: "todo", label: "To Do" },
  { id: "in_progress", label: "In Progress" },
  { id: "done", label: "Done" },
];

export default function TasksClient() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [active, setActive] = useState<Task | null>(null);
  const [commentText, setCommentText] = useState("");

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/tasks", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 401) {
        window.location.href = `/login?returnTo=${encodeURIComponent("/tasks")}`;
        return;
      }
      if (res.status === 403) {
        window.location.href = `/pending?returnTo=${encodeURIComponent("/tasks")}`;
        return;
      }
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        tasks?: Task[];
      };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "טעינת משימות נכשלה");
      setTasks(j.tasks ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "טעינת משימות נכשלה");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const grouped = useMemo(() => {
    return {
      todo: tasks.filter((t) => t.status === "todo"),
      in_progress: tasks.filter((t) => t.status === "in_progress"),
      done: tasks.filter((t) => t.status === "done"),
    };
  }, [tasks]);

  async function patchTask(
    task: Task,
    patch: { status?: TaskStatus; title?: string; dueAt?: string; commentText?: string }
  ) {
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: task.entityType,
        entityId: task.entityId,
        taskId: task.id,
        ...patch,
      }),
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      task?: Task;
    };
    if (!res.ok || !j.ok || !j.task) {
      setErr(j.error ?? "עדכון משימה נכשל");
      return;
    }
    setTasks((arr) => arr.map((t) => (t.id === task.id && t.entityId === task.entityId ? j.task! : t)));
    setActive((cur) =>
      cur && cur.id === task.id && cur.entityId === task.entityId ? j.task! : cur
    );
  }

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>משימות</h1>
        <span style={{ background: "#e0f2fe", color: "#0c4a6e", borderRadius: 999, padding: "4px 10px", fontWeight: 800, fontSize: 12 }}>
          {tasks.length} סה"כ
        </span>
      </div>

      {err && (
        <div style={{ marginBottom: 12, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: 12, borderRadius: 12 }}>
          {err}
        </div>
      )}
      {loading && <div style={{ color: "#6b7280", fontWeight: 700 }}>טוען...</div>}

      <div style={{ overflowX: "auto", maxWidth: "100%" }}>
        <div style={{ display: "flex", gap: 12, minWidth: 980 }}>
          {COLUMNS.map((col) => (
            <div
              key={col.id}
              style={{ width: 320, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 12 }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const payload = e.dataTransfer.getData("text/task-key");
                if (!payload) return;
                const [entityType, entityId, taskId] = payload.split("|");
                const task = tasks.find(
                  (t) =>
                    t.entityType === entityType &&
                    t.entityId === entityId &&
                    t.id === taskId
                );
                if (!task || task.status === col.id) return;
                void patchTask(task, { status: col.id });
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontWeight: 900 }}>{col.label}</div>
                <div style={{ border: "1px solid #e9d5ff", background: "#f5f3ff", color: "#6d28d9", borderRadius: 999, padding: "2px 8px", fontWeight: 800, fontSize: 12 }}>
                  {grouped[col.id].length}
                </div>
              </div>
              <div style={{ display: "grid", gap: 8, minHeight: 120 }}>
                {grouped[col.id].map((t) => (
                  <div
                    key={`${t.entityType}-${t.entityId}-${t.id}`}
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData(
                        "text/task-key",
                        `${t.entityType}|${t.entityId}|${t.id}`
                      )
                    }
                    style={{ border: "1px solid #f3f4f6", background: "#fafafa", borderRadius: 12, padding: 10, cursor: "grab" }}
                  >
                    <button type="button" onClick={() => setActive(t)} style={{ border: "none", background: "transparent", padding: 0, textAlign: "right", width: "100%", cursor: "pointer" }}>
                      <div style={{ fontWeight: 900, fontSize: 13 }}>{t.title}</div>
                      <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>
                        {t.entityType === "contact" ? "איש קשר" : "הזדמנות"}: {t.entityName}
                      </div>
                      <div style={{ marginTop: 2, fontSize: 12, color: "#6b7280" }}>
                        Due: {t.dueAt || "—"}
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {active && (
        <div style={{ position: "fixed", inset: 0, zIndex: 95 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)" }} onMouseDown={() => setActive(null)} />
          <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: "min(520px, 94vw)", background: "#fff", borderRight: "1px solid #e5e7eb", boxShadow: "12px 0 30px rgba(0,0,0,0.08)", padding: 16, overflow: "auto" }} onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, marginBottom: 10 }}>{active.title}</h3>
            <div style={{ display: "grid", gap: 8 }}>
              <input value={active.title} onChange={(e) => setActive((x) => (x ? { ...x, title: e.target.value } : x))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
              <input value={active.dueAt} onChange={(e) => setActive((x) => (x ? { ...x, dueAt: e.target.value } : x))} placeholder="YYYY-MM-DD HH:mm" style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
              <select value={active.status} onChange={(e) => setActive((x) => (x ? { ...x, status: e.target.value as TaskStatus } : x))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
              <button type="button" onClick={() => void patchTask(active, { title: active.title, dueAt: active.dueAt, status: active.status })} style={{ padding: "9px 12px", borderRadius: 10, border: "none", background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)", color: "#fff", fontWeight: 800, cursor: "pointer" }}>
                שמור משימה
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>תיעוד על משימה</div>
              <div style={{ display: "grid", gap: 8 }}>
                {(active.comments ?? []).map((c) => (
                  <div key={c.id} style={{ border: "1px solid #f3f4f6", borderRadius: 10, padding: 8, background: "#fafafa" }}>
                    <div style={{ fontSize: 12 }}>{c.text}</div>
                    <div style={{ marginTop: 4, fontSize: 11, color: "#6b7280" }}>{c.createdAt}</div>
                  </div>
                ))}
                <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="כתוב תיעוד..." style={{ minHeight: 80, padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                <button type="button" onClick={async () => {
                  const text = commentText.trim();
                  if (!text) return;
                  await patchTask(active, { commentText: text });
                  setCommentText("");
                }} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>
                  הוסף תיעוד
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


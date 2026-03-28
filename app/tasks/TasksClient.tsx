"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";

type TaskStatus = "todo" | "in_progress" | "done";
type TaskComment = { id: string; text: string; createdAt: string };
type Task = {
  id: string;
  title: string;
  dueAt: string;
  reminderAt?: string;
  status: TaskStatus;
  done: boolean;
  comments: TaskComment[];
  assignedRep?: string;
  entityType: "contact" | "opportunity";
  entityId: string;
  entityName: string;
  createdAt: string;
  pipelineId: string;
  pipelineName: string;
};

type PipelineRow = { id: string; name: string; stages: string[] };

type ViewMode = "status" | "pipeline" | "table";

const COLUMNS: Array<{ id: TaskStatus; label: string }> = [
  { id: "todo", label: "To Do" },
  { id: "in_progress", label: "In Progress" },
  { id: "done", label: "Done" },
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toLocalInput(iso: string): string {
  const s = String(iso ?? "").trim();
  if (!s) return "";
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  const d2 = new Date(s.replace(" ", "T"));
  if (Number.isNaN(d2.getTime())) return "";
  return `${d2.getFullYear()}-${pad2(d2.getMonth() + 1)}-${pad2(d2.getDate())}T${pad2(d2.getHours())}:${pad2(d2.getMinutes())}`;
}

function fromLocalInput(v: string): string {
  const s = v.trim();
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
}

function fmtWhen(iso: string): string {
  const s = String(iso ?? "").trim();
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
}

function entityHref(t: Task): string {
  return t.entityType === "contact"
    ? `/contacts?openContactId=${encodeURIComponent(t.entityId)}`
    : `/pipeline?openOpportunityId=${encodeURIComponent(t.entityId)}`;
}

export default function TasksClient() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pipelines, setPipelines] = useState<PipelineRow[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("status");
  const [active, setActive] = useState<Task | null>(null);
  const [dueLocal, setDueLocal] = useState("");
  const [reminderLocal, setReminderLocal] = useState("");
  const [commentText, setCommentText] = useState("");

  useEffect(() => {
    if (!active) {
      setDueLocal("");
      setReminderLocal("");
      return;
    }
    setDueLocal(toLocalInput(active.dueAt));
    setReminderLocal(toLocalInput(active.reminderAt ?? ""));
  }, [active]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [res, pres] = await Promise.all([
        fetch("/api/tasks", { credentials: "include", cache: "no-store" }),
        fetch("/api/opportunities/pipelines", { credentials: "include", cache: "no-store" }),
      ]);
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

      const pj = (await pres.json().catch(() => ({}))) as {
        ok?: boolean;
        pipelines?: PipelineRow[];
      };
      if (pres.ok && pj.ok) setPipelines(pj.pipelines ?? []);
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

  const pipelineSections = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of tasks) {
      if (!seen.has(t.pipelineId)) seen.set(t.pipelineId, t.pipelineName);
    }
    const ordered: { id: string; name: string }[] = [];
    if (seen.has("__contact__")) {
      ordered.push({ id: "__contact__", name: seen.get("__contact__") ?? "אנשי קשר" });
    }
    const rest = [...pipelines]
      .sort((a, b) => a.name.localeCompare(b.name, "he"))
      .filter((p) => seen.has(p.id))
      .map((p) => ({ id: p.id, name: p.name }));
    for (const p of rest) {
      if (!ordered.some((x) => x.id === p.id)) ordered.push(p);
    }
    for (const [id, name] of seen) {
      if (!ordered.some((x) => x.id === id)) ordered.push({ id, name });
    }
    return ordered;
  }, [tasks, pipelines]);

  async function patchTask(
    task: Task,
    patch: {
      status?: TaskStatus;
      title?: string;
      dueAt?: string;
      reminderAt?: string;
      commentText?: string;
    }
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
    setTasks((arr) =>
      arr.map((t) => (t.id === task.id && t.entityId === task.entityId ? j.task! : t))
    );
    setActive((cur) =>
      cur && cur.id === task.id && cur.entityId === task.entityId ? j.task! : cur
    );
  }

  function renderTaskCard(t: Task, opts?: { pipelineScope?: string }) {
    const blocked =
      opts?.pipelineScope !== undefined && t.pipelineId !== opts.pipelineScope;
    return (
      <div
        key={`${t.entityType}-${t.entityId}-${t.id}`}
        draggable={!blocked}
        onDragStart={(e) => {
          if (blocked) return;
          e.dataTransfer.setData("text/task-key", `${t.entityType}|${t.entityId}|${t.id}`);
        }}
        style={{
          border: "1px solid #f3f4f6",
          background: "#fafafa",
          borderRadius: 12,
          padding: 10,
          cursor: blocked ? "default" : "grab",
          opacity: blocked ? 0.5 : 1,
        }}
      >
        <button
          type="button"
          onClick={() => setActive(t)}
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            textAlign: "right",
            width: "100%",
            cursor: "pointer",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 13 }}>{t.title}</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>
            {t.entityType === "contact" ? "איש קשר" : "הזדמנות"}:{" "}
            <span
              role="link"
              tabIndex={0}
              onClick={(ev) => {
                ev.stopPropagation();
                window.location.href = entityHref(t);
              }}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") {
                  ev.stopPropagation();
                  window.location.href = entityHref(t);
                }
              }}
              style={{ color: "#4c1d95", fontWeight: 800, textDecoration: "underline" }}
            >
              {t.entityName}
            </span>
          </div>
          <div style={{ marginTop: 2, fontSize: 12, color: "#6b7280" }}>
            דדליין: {fmtWhen(t.dueAt)}
          </div>
          {t.reminderAt ? (
            <div style={{ marginTop: 2, fontSize: 11, color: "#7c3aed" }}>
              תזכורת: {fmtWhen(t.reminderAt)}
            </div>
          ) : null}
          <div style={{ marginTop: 2, fontSize: 11, color: "#9ca3af" }}>{t.pipelineName}</div>
        </button>
      </div>
    );
  }

  function onColumnDrop(col: TaskStatus, pipelineScope?: string) {
    return (e: DragEvent) => {
      const payload = e.dataTransfer.getData("text/task-key");
      if (!payload) return;
      const [entityType, entityId, taskId] = payload.split("|") as [
        Task["entityType"],
        string,
        string,
      ];
      const task = tasks.find(
        (x) => x.entityType === entityType && x.entityId === entityId && x.id === taskId
      );
      if (!task || task.status === col) return;
      if (pipelineScope !== undefined && task.pipelineId !== pipelineScope) return;
      void patchTask(task, { status: col });
    };
  }

  const viewToggle = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
      {(
        [
          ["status", "לפי סטטוס"],
          ["pipeline", "לפי פייפליין"],
          ["table", "טבלה"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => setViewMode(id)}
          style={{
            padding: "8px 14px",
            borderRadius: 999,
            border: viewMode === id ? "2px solid #6d28d9" : "1px solid #e5e7eb",
            background: viewMode === id ? "#f5f3ff" : "#fff",
            fontWeight: 800,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>משימות</h1>
        <span
          style={{
            background: "#e0f2fe",
            color: "#0c4a6e",
            borderRadius: 999,
            padding: "4px 10px",
            fontWeight: 800,
            fontSize: 12,
          }}
        >
          {`${tasks.length} סה"כ`}
        </span>
      </div>

      {viewToggle}

      {err && (
        <div
          style={{
            marginBottom: 12,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            padding: 12,
            borderRadius: 12,
          }}
        >
          {err}
        </div>
      )}
      {loading && <div style={{ color: "#6b7280", fontWeight: 700 }}>טוען...</div>}

      {viewMode === "status" && (
        <div style={{ overflowX: "auto", maxWidth: "100%" }}>
          <div style={{ display: "flex", gap: 12, minWidth: 980 }}>
            {COLUMNS.map((col) => (
              <div
                key={col.id}
                style={{
                  width: 320,
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 16,
                  padding: 12,
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onColumnDrop(col.id)}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 10,
                  }}
                >
                  <div style={{ fontWeight: 900 }}>{col.label}</div>
                  <div
                    style={{
                      border: "1px solid #e9d5ff",
                      background: "#f5f3ff",
                      color: "#6d28d9",
                      borderRadius: 999,
                      padding: "2px 8px",
                      fontWeight: 800,
                      fontSize: 12,
                    }}
                  >
                    {grouped[col.id].length}
                  </div>
                </div>
                <div style={{ display: "grid", gap: 8, minHeight: 120 }}>
                  {grouped[col.id].map((t) => renderTaskCard(t))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {viewMode === "pipeline" && (
        <div style={{ display: "grid", gap: 20 }}>
          {pipelineSections.map((sec) => (
            <div
              key={sec.id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 16,
                padding: 12,
                background: "#fff",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 10, fontSize: 15 }}>{sec.name}</div>
              <div style={{ overflowX: "auto" }}>
                <div style={{ display: "flex", gap: 10, minWidth: 900 }}>
                  {COLUMNS.map((col) => {
                    const list = tasks.filter((t) => t.pipelineId === sec.id && t.status === col.id);
                    return (
                      <div
                        key={col.id}
                        style={{
                          width: 280,
                          flexShrink: 0,
                          background: "#fafafa",
                          border: "1px dashed #e5e7eb",
                          borderRadius: 12,
                          padding: 10,
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={onColumnDrop(col.id, sec.id)}
                      >
                        <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 8, color: "#6b7280" }}>
                          {col.label} · {list.length}
                        </div>
                        <div style={{ display: "grid", gap: 8, minHeight: 80 }}>
                          {list.map((t) => renderTaskCard(t, { pipelineScope: sec.id }))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewMode === "table" && (
        <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb", textAlign: "right" }}>
                <th style={{ padding: 10, borderBottom: "1px solid #e5e7eb" }}>משימה</th>
                <th style={{ padding: 10, borderBottom: "1px solid #e5e7eb" }}>סטטוס</th>
                <th style={{ padding: 10, borderBottom: "1px solid #e5e7eb" }}>דדליין</th>
                <th style={{ padding: 10, borderBottom: "1px solid #e5e7eb" }}>תזכורת</th>
                <th style={{ padding: 10, borderBottom: "1px solid #e5e7eb" }}>פייפליין</th>
                <th style={{ padding: 10, borderBottom: "1px solid #e5e7eb" }}>קשר</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={`${t.entityType}-${t.entityId}-${t.id}`} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: 10 }}>
                    <button
                      type="button"
                      onClick={() => setActive(t)}
                      style={{
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        fontWeight: 800,
                        textAlign: "right",
                      }}
                    >
                      {t.title}
                    </button>
                  </td>
                  <td style={{ padding: 10 }}>{t.status}</td>
                  <td style={{ padding: 10 }}>{fmtWhen(t.dueAt)}</td>
                  <td style={{ padding: 10 }}>{fmtWhen(t.reminderAt ?? "")}</td>
                  <td style={{ padding: 10 }}>{t.pipelineName}</td>
                  <td style={{ padding: 10 }}>
                    <a href={entityHref(t)} style={{ color: "#4c1d95", fontWeight: 700 }}>
                      {t.entityType === "contact" ? "איש קשר" : "הזדמנות"}: {t.entityName}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {active && (
        <div style={{ position: "fixed", inset: 0, zIndex: 95 }}>
          <div
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)" }}
            onMouseDown={() => setActive(null)}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              height: "100%",
              width: "min(520px, 94vw)",
              background: "#fff",
              borderRight: "1px solid #e5e7eb",
              boxShadow: "12px 0 30px rgba(0,0,0,0.08)",
              padding: 16,
              overflow: "auto",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, marginBottom: 10 }}>{active.title}</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              <a
                href={entityHref(active)}
                style={{
                  display: "inline-block",
                  padding: "6px 10px",
                  borderRadius: 8,
                  background: "#ede9fe",
                  color: "#5b21b6",
                  fontWeight: 800,
                  fontSize: 12,
                  textDecoration: "none",
                }}
              >
                {active.entityType === "contact" ? "פתח איש קשר" : "פתח הזדמנות"}
              </a>
              <span style={{ fontSize: 12, color: "#6b7280", alignSelf: "center" }}>
                {active.pipelineName}
              </span>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <label style={{ fontWeight: 700, fontSize: 12 }}>כותרת</label>
              <input
                value={active.title}
                onChange={(e) => setActive((x) => (x ? { ...x, title: e.target.value } : x))}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
              <label style={{ fontWeight: 700, fontSize: 12 }}>דדליין (אופציונלי)</label>
              <input
                type="datetime-local"
                value={dueLocal}
                onChange={(e) => setDueLocal(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
              <label style={{ fontWeight: 700, fontSize: 12 }}>תזכורת — תאריך ושעה (אופציונלי)</label>
              <input
                type="datetime-local"
                value={reminderLocal}
                onChange={(e) => setReminderLocal(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
              <p style={{ margin: 0, fontSize: 11, color: "#6b7280", lineHeight: 1.4 }}>
                15 דקות לפני הדדליין נשלחת תזכורת אוטומטית (בנוסף לתזכורת שתקבעו כאן).
              </p>
              <label style={{ fontWeight: 700, fontSize: 12 }}>סטטוס</label>
              <select
                value={active.status}
                onChange={(e) =>
                  setActive((x) => (x ? { ...x, status: e.target.value as TaskStatus } : x))
                }
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
              <button
                type="button"
                onClick={() =>
                  void patchTask(active, {
                    title: active.title,
                    dueAt: fromLocalInput(dueLocal),
                    reminderAt: reminderLocal.trim() ? fromLocalInput(reminderLocal) : "",
                    status: active.status,
                  })
                }
                style={{
                  padding: "9px 12px",
                  borderRadius: 10,
                  border: "none",
                  background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                שמור משימה
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>תיעוד על משימה</div>
              <div style={{ display: "grid", gap: 8 }}>
                {(active.comments ?? []).map((c) => (
                  <div
                    key={c.id}
                    style={{
                      border: "1px solid #f3f4f6",
                      borderRadius: 10,
                      padding: 8,
                      background: "#fafafa",
                    }}
                  >
                    <div style={{ fontSize: 12 }}>{c.text}</div>
                    <div style={{ marginTop: 4, fontSize: 11, color: "#6b7280" }}>{c.createdAt}</div>
                  </div>
                ))}
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="כתוב תיעוד..."
                  style={{
                    minHeight: 80,
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                  }}
                />
                <button
                  type="button"
                  onClick={async () => {
                    const text = commentText.trim();
                    if (!text) return;
                    await patchTask(active, { commentText: text });
                    setCommentText("");
                  }}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    cursor: "pointer",
                  }}
                >
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

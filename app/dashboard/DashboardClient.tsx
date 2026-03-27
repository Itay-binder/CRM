"use client";

import { useEffect, useMemo, useState } from "react";
import CheckoutPagesManager from "@/app/components/CheckoutPagesManager";

type MetricsOk = {
  ok: true;
  total: number;
  stageColumn?: string | null;
  countsByStage: Record<string, number>;
  warning?: string;
};
type MetricsErr = { ok: false; error: string };
type TaskRow = {
  id: string;
  title: string;
  dueAt: string;
  status: "todo" | "in_progress" | "done";
  entityType: "contact" | "opportunity";
  entityName: string;
  assignedRep?: string;
};

type WidgetId = "kpi_total" | "stages" | "tasks" | "checkout";
type WidgetConfig = { id: WidgetId; title: string; visible: boolean };
const DASHBOARD_WIDGETS_KEY = "crm:dashboard:widgets";

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "kpi_total", title: "סה\"כ לידים", visible: true },
  { id: "stages", title: "לידים לפי סטטוס", visible: true },
  { id: "tasks", title: "משימות", visible: true },
  { id: "checkout", title: "דפי סליקה", visible: true },
];

function prettyCount(n: number) {
  return n.toLocaleString("en-US");
}

export default function DashboardClient() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [countsByStage, setCountsByStage] = useState<Record<string, number>>({});
  const [warning, setWarning] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [widgets, setWidgets] = useState<WidgetConfig[]>(DEFAULT_WIDGETS);
  const [manageOpen, setManageOpen] = useState(false);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (dateFrom.trim()) params.set("date_from", dateFrom.trim());
    if (dateTo.trim()) params.set("date_to", dateTo.trim());
    const q = params.toString();
    return q ? `?${q}` : "";
  }, [dateFrom, dateTo]);

  async function load() {
    setLoading(true);
    setErr(null);
    setWarning(null);
    try {
      const [res, tasksRes] = await Promise.all([
        fetch(`/api/dashboard/metrics${query}`, {
          cache: "no-store",
          credentials: "include",
        }),
        fetch("/api/tasks", {
          cache: "no-store",
          credentials: "include",
        }),
      ]);

      if (res.status === 401) {
        window.location.href = `/login?returnTo=${encodeURIComponent("/dashboard")}`;
        return;
      }
      if (res.status === 403) {
        window.location.href = `/pending?returnTo=${encodeURIComponent("/dashboard")}`;
        return;
      }

      const json = (await res.json().catch(() => ({}))) as MetricsOk | MetricsErr;
      if (!json || !("ok" in json) || json.ok !== true) {
        setErr("שגיאה בטעינת מדדים");
        return;
      }
      setTotal(json.total ?? 0);
      setCountsByStage(json.countsByStage ?? {});
      setWarning(json.warning ?? null);

      if (tasksRes.ok) {
        const tasksJson = (await tasksRes.json().catch(() => ({}))) as {
          ok?: boolean;
          tasks?: TaskRow[];
        };
        if (tasksJson.ok) setTasks(tasksJson.tasks ?? []);
      }
    } catch {
      setErr("לא ניתן לטעון מדדים");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DASHBOARD_WIDGETS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as WidgetConfig[];
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      const valid = parsed.filter((w) =>
        DEFAULT_WIDGETS.some((d) => d.id === w.id)
      );
      const missing = DEFAULT_WIDGETS.filter(
        (d) => !valid.some((w) => w.id === d.id)
      );
      setWidgets([...valid, ...missing]);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(DASHBOARD_WIDGETS_KEY, JSON.stringify(widgets));
    } catch {}
  }, [widgets]);

  function widgetVisible(id: WidgetId): boolean {
    return widgets.find((w) => w.id === id)?.visible ?? true;
  }

  function moveWidget(idx: number, dir: -1 | 1) {
    setWidgets((arr) => {
      const to = idx + dir;
      if (to < 0 || to >= arr.length) return arr;
      const next = [...arr];
      [next[idx], next[to]] = [next[to], next[idx]];
      return next;
    });
  }

  const sortedTasks = [...tasks].sort((a, b) =>
    String(a.dueAt ?? "").localeCompare(String(b.dueAt ?? ""), "he")
  );

  function renderWidget(id: WidgetId) {
    if (id === "kpi_total") {
      return (
        <div key={id} style={{ marginTop: 18, display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16 }}>
            <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>סה"כ לידים</div>
            <div style={{ fontSize: 42, fontWeight: 900, color: "#6d28d9" }}>{prettyCount(total)}</div>
          </div>
        </div>
      );
    }
    if (id === "stages") {
      return (
        <div key={id} style={{ marginTop: 16 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>לידים לפי סטטוס</h2>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            {Object.keys(countsByStage).length === 0 ? (
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, color: "#6b7280" }}>
                אין נתונים להצגה.
              </div>
            ) : (
              Object.entries(countsByStage)
                .sort((a, b) => b[1] - a[1])
                .map(([stage, count]) => (
                  <div key={stage} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 14 }}>
                    <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800, wordBreak: "break-word" }}>{stage}</div>
                    <div style={{ fontSize: 30, fontWeight: 900, color: "#6d28d9", marginTop: 6 }}>{prettyCount(count)}</div>
                  </div>
                ))
            )}
          </div>
        </div>
      );
    }
    if (id === "tasks") {
      return (
        <div key={id} style={{ marginTop: 16, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #f3f4f6", fontWeight: 900 }}>משימות</div>
          <div style={{ overflowX: "auto", maxWidth: "100%" }}>
            <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["כותרת", "סטטוס", "קשור ל", "אחראי", "Due"].map((h) => (
                    <th key={h} style={{ textAlign: "right", padding: "10px 12px", borderBottom: "2px solid #e5e7eb", background: "#f8fafc", fontSize: 12, fontWeight: 900 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedTasks.slice(0, 20).map((t) => (
                  <tr key={`${t.entityType}-${t.id}-${t.title}`}>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>{t.title}</td>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>{t.status}</td>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>{t.entityType === "contact" ? "איש קשר" : "הזדמנות"} · {t.entityName}</td>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>{t.assignedRep ?? "-"}</td>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>{t.dueAt || "-"}</td>
                  </tr>
                ))}
                {!loading && sortedTasks.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 12, color: "#6b7280", fontWeight: 700 }}>
                      אין משימות להצגה.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
    return <CheckoutPagesManager key={id} compact />;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>מתאריך</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "#fff",
            }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>עד תאריך</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "#fff",
            }}
          />
        </div>

        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          style={{
            padding: "10px 16px",
            borderRadius: 12,
            border: "none",
            cursor: "pointer",
            fontWeight: 800,
            background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
            color: "#fff",
            height: 42,
          }}
        >
          {loading ? "טוען…" : "רענן"}
        </button>
        <button
          type="button"
          onClick={() => setManageOpen((x) => !x)}
          style={{
            padding: "10px 16px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            cursor: "pointer",
            fontWeight: 800,
            background: "#fff",
            height: 42,
          }}
        >
          ניהול דשבורד
        </button>
      </div>

      {manageOpen && (
        <div style={{ marginTop: 12, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>בחירת חלוניות וסדר</div>
          <div style={{ display: "grid", gap: 8 }}>
            {widgets.map((w, idx) => (
              <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={w.visible}
                  onChange={(e) =>
                    setWidgets((arr) =>
                      arr.map((x) => (x.id === w.id ? { ...x, visible: e.target.checked } : x))
                    )
                  }
                />
                <span style={{ minWidth: 180 }}>{w.title}</span>
                <button type="button" onClick={() => moveWidget(idx, -1)} style={{ border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", cursor: "pointer" }}>↑</button>
                <button type="button" onClick={() => moveWidget(idx, 1)} style={{ border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", cursor: "pointer" }}>↓</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {warning && (
        <div style={{ marginTop: 14, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: 12, borderRadius: 12 }}>
          {warning}
        </div>
      )}

      {err && (
        <div style={{ marginTop: 14, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: 12, borderRadius: 12 }}>
          {err}
        </div>
      )}

      {widgets.filter((w) => w.visible).map((w) => renderWidget(w.id))}
    </div>
  );
}


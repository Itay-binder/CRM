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

function prettyCount(n: number) {
  return n.toLocaleString("en-US");
}

export default function DashboardClient() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [countsByStage, setCountsByStage] = useState<Record<string, number>>({});
  const [warning, setWarning] = useState<string | null>(null);

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
      const res = await fetch(`/api/dashboard/metrics${query}`, {
        cache: "no-store",
        credentials: "include",
      });

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
      </div>

      <div style={{ marginTop: 18, display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>סה"כ לידים</div>
          <div style={{ fontSize: 42, fontWeight: 900, color: "#6d28d9" }}>{prettyCount(total)}</div>
        </div>
      </div>

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

      <div style={{ marginTop: 16 }}>
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

      <CheckoutPagesManager compact />
    </div>
  );
}


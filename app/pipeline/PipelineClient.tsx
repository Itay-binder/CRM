"use client";

import { useEffect, useMemo, useState } from "react";

type PipelineOk = {
  ok: true;
  stageColumn?: string | null;
  stages: string[];
  leadsByStage: Record<string, Record<string, string>[]>;
};
type PipelineErr = { ok: false; error: string };

export default function PipelineClient() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stages, setStages] = useState<string[]>([]);
  const [leadsByStage, setLeadsByStage] = useState<Record<string, Record<string, string>[]>>({});

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
    try {
      const res = await fetch(`/api/pipeline${query}`, { credentials: "include", cache: "no-store" });
      if (res.status === 401) {
        window.location.href = `/login?returnTo=${encodeURIComponent("/pipeline")}`;
        return;
      }
      if (res.status === 403) {
        window.location.href = `/pending?returnTo=${encodeURIComponent("/pipeline")}`;
        return;
      }

      const json = (await res.json().catch(() => ({}))) as PipelineOk | PipelineErr;
      if (!json || json.ok !== true) {
        setErr("שגיאה בטעינת pipeline");
        return;
      }
      setStages(json.stages ?? []);
      setLeadsByStage(json.leadsByStage ?? {});
    } catch {
      setErr("לא ניתן לטעון pipeline");
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
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>עד תאריך</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}
          />
        </div>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
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

      {err && (
        <div style={{ marginTop: 14, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: 12, borderRadius: 12 }}>
          {err}
        </div>
      )}

      <div style={{ marginTop: 16, overflowX: "auto", paddingBottom: 10 }}>
        <div style={{ display: "flex", gap: 12, minWidth: 900 }}>
          {stages.length === 0 ? (
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, color: "#6b7280", fontWeight: 700 }}>
              {loading ? "טוען…" : "אין נתונים"}
            </div>
          ) : (
            stages.map((stage) => {
              const list = leadsByStage[stage] ?? [];
              return (
                <div key={stage} style={{ width: 320, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 900 }}>{stage}</div>
                    <div style={{ background: "#f5f3ff", border: "1px solid #e9d5ff", padding: "4px 8px", borderRadius: 999, fontWeight: 900, color: "#6d28d9" }}>
                      {list.length}
                    </div>
                  </div>
                  <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                    {list.length === 0 ? (
                      <div style={{ color: "#9ca3af", fontWeight: 700, fontSize: 12 }}>אין לידים כאן</div>
                    ) : (
                      list.slice(0, 30).map((lead, idx) => {
                        // Try to find "email"/"phone"/"name" for title
                        const title =
                          lead["email"] ||
                          lead["Email"] ||
                          lead["טלפון"] ||
                          lead["Phone"] ||
                          lead["אימייל"] ||
                          lead["שם"] ||
                          lead["full name"] ||
                          lead[Object.keys(lead)[0]] ||
                          "";
                        return (
                          <div
                            key={idx}
                            style={{
                              border: "1px solid #f3f4f6",
                              borderRadius: 12,
                              padding: 10,
                              background: "#fafafa",
                            }}
                          >
                            <div style={{ fontWeight: 900, fontSize: 12, wordBreak: "break-word" }}>{String(title).slice(0, 60)}</div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div style={{ marginTop: 12, color: "#6b7280", fontSize: 12, fontWeight: 700 }}>
        MVP: כרגע pipeline לקריאה בלבד (בהמשך נוסיף שינוי סטטוס + עדכון חזרה ל-Google Sheets).
      </div>
    </div>
  );
}


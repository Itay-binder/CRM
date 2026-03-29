"use client";

import { useCallback, useEffect, useState } from "react";
import type { WebhookEventId, WebhookTriggerRow } from "@/lib/webhooks/triggersTypes";
import { ALL_WEBHOOK_EVENTS, WEBHOOK_EVENT_LABELS } from "@/lib/webhooks/triggersTypes";

export default function TriggersClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [rows, setRows] = useState<WebhookTriggerRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/settings/webhooks", { credentials: "include", cache: "no-store" });
      if (res.status === 401) {
        window.location.href = `/login?returnTo=${encodeURIComponent("/settings/triggers")}`;
        return;
      }
      if (res.status === 403) {
        setErr("אין הרשאה (נדרש מנהל).");
        return;
      }
      const j = (await res.json()) as { ok?: boolean; triggers?: WebhookTriggerRow[]; error?: string };
      if (!j.ok) {
        setErr(j.error ?? "שגיאה בטעינה");
        return;
      }
      setRows(j.triggers ?? []);
    } catch {
      setErr("שגיאה בטעינה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setErr(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/settings/webhooks", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggers: rows }),
      });
      const j = (await res.json()) as { ok?: boolean; triggers?: WebhookTriggerRow[]; error?: string };
      if (!j.ok) {
        setErr(j.error ?? "שגיאה בשמירה");
        return;
      }
      setRows(j.triggers ?? rows);
      setOkMsg("נשמר.");
    } catch {
      setErr("שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  }

  function addRow() {
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `t-${Date.now()}`;
    setRows((r) => [
      ...r,
      {
        id,
        label: "טריגר חדש",
        event: "lead_created",
        enabled: false,
        url: "",
      },
    ]);
  }

  function removeRow(id: string) {
    setRows((r) => r.filter((x) => x.id !== id));
  }

  function patchRow(id: string, patch: Partial<WebhookTriggerRow>) {
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      <h1 style={{ margin: "0 0 8px", fontSize: 26 }}>טריגרים ו־Webhooks</h1>
      <p style={{ margin: "0 0 20px", color: "#4b5563", lineHeight: 1.5 }}>
        הגדר לאן נשלחים אירועי המערכת (Make, n8n, וכו׳). גוף הבקשה הוא JSON עם שדות{" "}
        <code style={{ background: "#f3f4f6", padding: "2px 6px", borderRadius: 6 }}>event</code>,{" "}
        <code style={{ background: "#f3f4f6", padding: "2px 6px", borderRadius: 6 }}>sentAt</code> ונתוני
        הקשר (משימה / ליד / הזדמנות). תזכורות משימות מסתנכרנות עם ה-cron (GitHub Actions כל 5 דק׳).
      </p>

      {loading ? (
        <p>טוען…</p>
      ) : (
        <>
          {err ? (
            <div
              style={{
                marginBottom: 16,
                padding: 12,
                borderRadius: 10,
                background: "#fef2f2",
                color: "#991b1b",
              }}
            >
              {err}
            </div>
          ) : null}
          {okMsg ? (
            <div
              style={{
                marginBottom: 16,
                padding: 12,
                borderRadius: 10,
                background: "#ecfdf5",
                color: "#065f46",
              }}
            >
              {okMsg}
            </div>
          ) : null}

          <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f9fafb", textAlign: "right" }}>
                  <th style={{ padding: 10 }}>פעיל</th>
                  <th style={{ padding: 10 }}>שם</th>
                  <th style={{ padding: 10 }}>אירוע</th>
                  <th style={{ padding: 10 }}>URL</th>
                  <th style={{ padding: 10, width: 72 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                    <td style={{ padding: 10, verticalAlign: "top" }}>
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        onChange={(e) => patchRow(row.id, { enabled: e.target.checked })}
                      />
                    </td>
                    <td style={{ padding: 10, verticalAlign: "top" }}>
                      <input
                        value={row.label}
                        onChange={(e) => patchRow(row.id, { label: e.target.value })}
                        style={{ width: "100%", minWidth: 140, padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
                      />
                    </td>
                    <td style={{ padding: 10, verticalAlign: "top" }}>
                      <select
                        value={row.event}
                        onChange={(e) =>
                          patchRow(row.id, { event: e.target.value as WebhookEventId })
                        }
                        style={{ width: "100%", minWidth: 200, padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
                      >
                        {ALL_WEBHOOK_EVENTS.map((ev) => (
                          <option key={ev} value={ev}>
                            {WEBHOOK_EVENT_LABELS[ev]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: 10, verticalAlign: "top" }}>
                      <input
                        value={row.url}
                        onChange={(e) => patchRow(row.id, { url: e.target.value })}
                        placeholder="https://..."
                        dir="ltr"
                        style={{ width: "100%", minWidth: 260, padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
                      />
                    </td>
                    <td style={{ padding: 10, verticalAlign: "top" }}>
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: "1px solid #fecaca",
                          background: "#fff",
                          color: "#b91c1c",
                          cursor: "pointer",
                        }}
                      >
                        מחק
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
            <button
              type="button"
              onClick={addRow}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                background: "#fff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              + טריגר
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              style={{
                padding: "10px 20px",
                borderRadius: 10,
                border: "none",
                background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
                color: "#fff",
                fontWeight: 700,
                cursor: saving ? "wait" : "pointer",
              }}
            >
              {saving ? "שומר…" : "שמור"}
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={saving || loading}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#f9fafb",
                cursor: "pointer",
              }}
            >
              רענן מהשרת
            </button>
          </div>
        </>
      )}
    </div>
  );
}

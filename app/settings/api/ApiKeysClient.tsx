"use client";

import { useCallback, useEffect, useState } from "react";
import SettingsSectionNav from "@/app/components/SettingsSectionNav";

type KeyRow = {
  id: string;
  label: string;
  createdAt: string | null;
  createdBy?: string;
  revoked: boolean;
  hint?: string;
};

export default function ApiKeysClient() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKeyPlain, setNewKeyPlain] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setForbidden(false);
    try {
      const res = await fetch("/api/settings/api-keys", { credentials: "include" });
      const j = (await res.json()) as { ok?: boolean; error?: string; keys?: KeyRow[] };
      if (res.status === 403) {
        setForbidden(true);
        setKeys([]);
        return;
      }
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "טעינה נכשלה");
        return;
      }
      setKeys(j.keys ?? []);
    } catch {
      setErr("טעינה נכשלה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createKey() {
    setCreating(true);
    setErr(null);
    setNewKeyPlain(null);
    try {
      const res = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ label: label.trim() || undefined }),
      });
      const j = (await res.json()) as { ok?: boolean; apiKey?: string; error?: string };
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok || !j.ok || !j.apiKey) {
        setErr(j.error ?? "יצירה נכשלה");
        return;
      }
      setNewKeyPlain(j.apiKey);
      setLabel("");
      await load();
    } catch {
      setErr("יצירה נכשלה");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!window.confirm("לבטל מפתח זה? אינטגרציות שמשתמשות בו יפסיקו לעבוד.")) return;
    setErr(null);
    try {
      const res = await fetch(`/api/settings/api-keys/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "ביטול נכשל");
        return;
      }
      await load();
    } catch {
      setErr("ביטול נכשל");
    }
  }

  return (
    <div>
      <SettingsSectionNav active="api" />
      <div
        style={{
          maxWidth: 720,
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #e5e7eb",
          padding: 20,
        }}
      >
        <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>מפתחות API לקליטת נתונים</h1>
        <p style={{ margin: "0 0 16px", color: "#6b7280", lineHeight: 1.5, fontSize: 14 }}>
          מפתחות פעילים רק עבור <strong>מסד הנתונים של העסק הנוכחי</strong> (הדייר הפעיל). שלחו את
          המפתח בכותרת <code dir="ltr">x-api-key</code>, <code dir="ltr">x-crm-api-key</code>, או{" "}
          <code dir="ltr">Authorization: Bearer …</code> — כמו עם מפתח ה־Vercel הגלובלי. אם מוגדר{" "}
          <code dir="ltr">CRM_INGEST_API_KEY</code>, הוא עדיין נתמך ואינו דורש שינוי באינטגרציות
          קיימות.
        </p>

        {forbidden && (
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              background: "#fef3c7",
              color: "#92400e",
              marginBottom: 16,
            }}
          >
            רק מנהלים יכולים לנהל מפתחות API.
          </div>
        )}

        {err && (
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              background: "#fee2e2",
              color: "#991b1b",
              marginBottom: 16,
            }}
          >
            {err}
          </div>
        )}

        {newKeyPlain && (
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              background: "#ecfdf5",
              border: "1px solid #6ee7b7",
              marginBottom: 16,
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 8 }}>המפתח הוצג פעם אחת בלבד — העתיקו עכשיו</div>
            <textarea
              readOnly
              dir="ltr"
              value={newKeyPlain}
              onFocus={(e) => e.target.select()}
              style={{
                width: "100%",
                minHeight: 72,
                fontFamily: "monospace",
                fontSize: 13,
                padding: 10,
                borderRadius: 8,
                border: "1px solid #d1d5db",
              }}
            />
            <button
              type="button"
              onClick={() => setNewKeyPlain(null)}
              style={{
                marginTop: 8,
                padding: "8px 12px",
                borderRadius: 10,
                border: "none",
                background: "#111827",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              סיימתי, הסתר
            </button>
          </div>
        )}

        {!forbidden && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
            <input
              type="text"
              placeholder="תיאור (אופציונלי), למשל Make"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              style={{
                flex: "1 1 200px",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
              }}
            />
            <button
              type="button"
              disabled={creating}
              onClick={() => void createKey()}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: "none",
                cursor: creating ? "wait" : "pointer",
                fontWeight: 700,
                background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
                color: "#fff",
              }}
            >
              {creating ? "יוצר…" : "צור מפתח חדש"}
            </button>
          </div>
        )}

        {loading ? (
          <div style={{ color: "#6b7280" }}>טוען…</div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {keys.length === 0 && !forbidden && (
              <li style={{ color: "#6b7280" }}>אין מפתחות במסד זה. אפשר להמשיך להשתמש רק ב־CRM_INGEST_API_KEY מהסביבה.</li>
            )}
            {keys.map((k) => (
              <li
                key={k.id}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "12px 0",
                  borderBottom: "1px solid #f3f4f6",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{k.label}</div>
                  <div dir="ltr" style={{ fontSize: 12, color: "#6b7280" }}>
                    csk_live_…{k.hint ? `…${k.hint}` : ""} ·{" "}
                    {k.createdAt ? new Date(k.createdAt).toLocaleString("he-IL") : "—"}
                    {k.revoked ? " · מבוטל" : ""}
                  </div>
                </div>
                {!k.revoked && !forbidden && (
                  <button
                    type="button"
                    onClick={() => void revoke(k.id)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "1px solid #fecaca",
                      background: "#fff",
                      color: "#b91c1c",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    ביטול מפתח
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

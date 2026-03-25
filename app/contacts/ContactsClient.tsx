"use client";

import { useEffect, useMemo, useState } from "react";

type LeadsOk = {
  ok: true;
  headers: string[];
  uniqueContactColumn?: string | null;
  count: number;
  rows: Record<string, string>[];
};
type LeadsErr = { ok: false; error: string };

function formatHeader(h: string) {
  return h;
}

export default function ContactsClient() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [count, setCount] = useState(0);

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
      const res = await fetch(`/api/contacts${query}`, { credentials: "include", cache: "no-store" });
      if (res.status === 401) {
        window.location.href = `/login?returnTo=${encodeURIComponent("/contacts")}`;
        return;
      }
      if (res.status === 403) {
        window.location.href = `/pending?returnTo=${encodeURIComponent("/contacts")}`;
        return;
      }

      const json = (await res.json().catch(() => ({}))) as LeadsOk | LeadsErr;
      if (!json || json.ok !== true) {
        setErr("שגיאה בטעינת contacts");
        return;
      }

      setHeaders(json.headers ?? []);
      setRows(json.rows ?? []);
      setCount(json.count ?? 0);
    } catch {
      setErr("לא ניתן לטעון contacts");
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
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
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

        <div style={{ fontSize: 14, fontWeight: 800, color: "#6b7280" }}>
          {loading ? "טוען…" : `${count} רשומות`}
        </div>
      </div>

      <div style={{ marginTop: 14, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: 14, borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>אנשי קשר (MVP)</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
            כרגע זה קורא את הלידים מה-Google Sheets ומציג אותם כטבלה. בעתיד נוסיף עריכה/יצירה + Custom Fields.
          </div>
        </div>

        {err && (
          <div style={{ padding: 14, background: "#fef2f2", borderTop: "1px solid #fecaca", color: "#b91c1c" }}>
            {err}
          </div>
        )}

        {!loading && headers.length > 0 ? (
          <div style={{ overflow: "auto", maxHeight: 600 }}>
            <table style={{ width: "max-content", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {headers.map((h) => (
                    <th
                      key={h}
                      style={{
                        position: "sticky",
                        top: 0,
                        background: "#f5f3ff",
                        padding: "10px 12px",
                        borderBottom: "2px solid #e9d5ff",
                        textAlign: "right",
                        fontWeight: 900,
                        fontSize: 12,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatHeader(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    {headers.map((h) => (
                      <td
                        key={h}
                        style={{
                          padding: "10px 12px",
                          borderBottom: "1px solid #f3f4f6",
                          verticalAlign: "top",
                          fontSize: 12,
                          maxWidth: 360,
                          wordBreak: "break-word",
                        }}
                      >
                        {row[h] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: 16, color: "#6b7280", fontWeight: 700 }}>
            {loading ? "טוען…" : "אין נתונים"}
          </div>
        )}
      </div>
    </div>
  );
}


"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";

type DraftRow = {
  id: string;
  name: string;
  templateId: string;
  updatedAt: string;
};

type CampaignRow = {
  id: string;
  broadcastName?: string;
  templateName: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdBy: string;
  createdAt: string;
};

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

export default function BroadcastsHomeClient() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [dRes, cRes] = await Promise.all([
        fetch("/api/whatsapp/broadcasts/drafts", { credentials: "include", cache: "no-store" }),
        fetch("/api/whatsapp/campaigns/send", { credentials: "include", cache: "no-store" }),
      ]);
      if (dRes.status === 401) {
        window.location.href = `/login?returnTo=${encodeURIComponent("/whatsapp-automations")}`;
        return;
      }
      const dj = await parseJson<{ ok?: boolean; drafts?: DraftRow[]; error?: string }>(dRes);
      const cj = await parseJson<{ ok?: boolean; campaigns?: CampaignRow[]; error?: string }>(cRes);
      if (!dj.ok) throw new Error(dj.error || "טעינת טיוטות נכשלה");
      if (!cj.ok) throw new Error(cj.error || "טעינת היסטוריה נכשלה");
      setDrafts(dj.drafts ?? []);
      setCampaigns(cj.campaigns ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function removeDraft(id: string) {
    if (!window.confirm("למחוק את הטיוטה?")) return;
    try {
      const res = await fetch(`/api/whatsapp/broadcasts/drafts/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = await parseJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "מחיקה נכשלה");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "מחיקה נכשלה");
    }
  }

  const tableStyle = { width: "100%", borderCollapse: "collapse" as const, fontSize: 14 };
  const th = { textAlign: "right" as const, padding: "10px 8px", borderBottom: "2px solid #e5e7eb", color: "#6b7280", fontWeight: 800 };
  const td = { padding: "12px 8px", borderBottom: "1px solid #f3f4f6", verticalAlign: "top" as const };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 18 }}>
        <Link
          href="/whatsapp-automations/broadcasts/new"
          style={{
            padding: "10px 18px",
            borderRadius: 10,
            background: "#2563eb",
            color: "#fff",
            fontWeight: 800,
            textDecoration: "none",
            fontSize: 14,
          }}
        >
          + ברודקאסט חדש
        </Link>
        <Link
          href="/whatsapp-automations/templates"
          style={{
            padding: "10px 18px",
            borderRadius: 10,
            border: "1px solid #cbd5e1",
            background: "#fff",
            color: "#1e40af",
            fontWeight: 700,
            textDecoration: "none",
            fontSize: 14,
          }}
        >
          כל התבניות
        </Link>
        <button
          type="button"
          onClick={() => void load()}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          רענן
        </button>
      </div>

      {err ? (
        <div style={{ padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b", marginBottom: 12 }}>{err}</div>
      ) : null}

      {loading ? (
        <div style={{ color: "#6b7280" }}>טוען…</div>
      ) : (
        <>
          <div
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 14,
              overflow: "hidden",
              marginBottom: 22,
            }}
          >
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #f3f4f6", fontWeight: 900, fontSize: 16 }}>טיוטות</div>
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={th} />
                    <th style={th}>שם</th>
                    <th style={th}>עדכון אחרון</th>
                    <th style={{ ...th, width: 120 }} />
                  </tr>
                </thead>
                <tbody>
                  {drafts.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ ...td, color: "#6b7280" }}>
                        אין טיוטות. צרו ברודקאסט חדש או שמרו טיוטה ממסך העריכה.
                      </td>
                    </tr>
                  ) : (
                    drafts.map((d) => (
                      <tr key={d.id}>
                        <td style={td}>✎</td>
                        <td style={{ ...td, fontWeight: 700 }}>
                          <Link href={`/whatsapp-automations/broadcasts/new?draft=${encodeURIComponent(d.id)}`} style={{ color: "#4c1d95" }}>
                            {d.name}
                          </Link>
                        </td>
                        <td style={{ ...td, fontSize: 13, color: "#6b7280" }} dir="ltr">
                          {d.updatedAt ? formatIsraelDateTime(d.updatedAt) : "—"}
                        </td>
                        <td style={td}>
                          <button
                            type="button"
                            onClick={() => void removeDraft(d.id)}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 8,
                              border: "1px solid #fecaca",
                              background: "#fff",
                              color: "#b91c1c",
                              cursor: "pointer",
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            מחק
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #f3f4f6", fontWeight: 900, fontSize: 16 }}>היסטוריה</div>
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={th} />
                    <th style={th}>שם</th>
                    <th style={th}>התחלה</th>
                    <th style={th}>נשלחו</th>
                    <th style={th}>הצליחו</th>
                    <th style={th}>נכשלו</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ ...td, color: "#6b7280" }}>
                        עדיין לא נשלחו ברודקאסטים.
                      </td>
                    </tr>
                  ) : (
                    campaigns.map((c) => {
                      const pct =
                        c.recipientCount > 0 ? ((100 * c.sentCount) / c.recipientCount).toFixed(1) : "0";
                      return (
                        <tr key={c.id}>
                          <td style={td}>
                            <span style={{ fontSize: 18 }} title="WhatsApp">📱</span>
                          </td>
                          <td style={{ ...td, fontWeight: 700 }}>{c.broadcastName || c.templateName}</td>
                          <td style={{ ...td, fontSize: 13, color: "#6b7280" }} dir="ltr">
                            {formatIsraelDateTime(c.createdAt)}
                          </td>
                          <td style={td}>{c.recipientCount}</td>
                          <td style={{ ...td, color: "#065f46", fontWeight: 700 }}>
                            {c.sentCount}{" "}
                            <span style={{ fontWeight: 500, color: "#6b7280", fontSize: 12 }}>({pct}%)</span>
                          </td>
                          <td style={{ ...td, color: c.failedCount ? "#b91c1c" : "#6b7280" }}>{c.failedCount}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 12, color: "#9ca3af", padding: "10px 16px", borderTop: "1px solid #f9fafb" }}>
              אחוזי מסירה/נקרא/קליק דורשים Webhook סטטוסים ממטא — ניתן להוסיף בשלב הבא.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";

type TemplateVm = {
  id: string;
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language: string;
  bodyText: string;
  exampleValues: string[];
  status: "draft" | "submitted" | "approved" | "rejected";
  metaTemplateId?: string;
  metaStatus?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
};

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

export default function TemplatesPageClient() {
  const [loading, setLoading] = useState(true);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateVm[]>([]);

  const [tplName, setTplName] = useState("");
  const [tplCategory, setTplCategory] = useState<"MARKETING" | "UTILITY" | "AUTHENTICATION">("MARKETING");
  const [tplLanguage, setTplLanguage] = useState("he");
  const [tplBodyText, setTplBodyText] = useState("");
  const [tplExampleValues, setTplExampleValues] = useState("");
  const [tplSearch, setTplSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/whatsapp/templates", { credentials: "include", cache: "no-store" });
      if (res.status === 401) {
        window.location.href = `/login?returnTo=${encodeURIComponent("/whatsapp-automations/templates")}`;
        return;
      }
      const j = await parseJson<{ ok?: boolean; templates?: TemplateVm[]; error?: string }>(res);
      if (!j.ok) throw new Error(j.error || "שגיאה בטעינה");
      setTemplates(j.templates ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveTemplate() {
    setSavingTemplate(true);
    setErr(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/whatsapp/templates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tplName,
          category: tplCategory,
          language: tplLanguage,
          bodyText: tplBodyText,
          exampleValues: tplExampleValues
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        }),
      });
      const j = await parseJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "יצירת טמפלט נכשלה");
      setTplName("");
      setTplBodyText("");
      setTplExampleValues("");
      setOkMsg("הטמפלט נשמר. ניתן לשלוח לאישור במטא או לבחור בברודקאסט.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "יצירת טמפלט נכשלה");
    } finally {
      setSavingTemplate(false);
    }
  }

  async function submitTemplate(templateId: string) {
    setErr(null);
    setOkMsg(null);
    try {
      const res = await fetch(`/api/whatsapp/templates/${encodeURIComponent(templateId)}/submit`, {
        method: "POST",
        credentials: "include",
      });
      const j = await parseJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "שליחה לאישור Meta נכשלה");
      setOkMsg("הטמפלט נשלח לאישור ב-Meta.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שליחה לאישור נכשלה");
    }
  }

  const filtered = templates.filter((t) => {
    const q = tplSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      t.language.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q)
    );
  });

  const statusLabel = (s: TemplateVm["status"]) => {
    if (s === "approved") return { text: "מאושר", color: "#065f46" };
    if (s === "rejected") return { text: "נדחה", color: "#b91c1c" };
    if (s === "submitted") return { text: "בבדיקה", color: "#b45309" };
    return { text: "טיוטה", color: "#6b7280" };
  };

  return (
    <div>
      <p style={{ margin: "0 0 16px", color: "#4b5563", lineHeight: 1.55, fontSize: 14 }}>
        תבניות WhatsApp חייבות אישור מטא לפני שליחה המונית. אפשר ליצור כאן טיוטה, לשלוח לאישור, ואז לבחור בברודקאסט.{" "}
        <Link href="/whatsapp-automations/broadcasts/new" style={{ color: "#2563eb", fontWeight: 700 }}>
          חזרה לברודקאסט חדש
        </Link>
      </p>

      {err ? (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b" }}>{err}</div>
      ) : null}
      {okMsg ? (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: "#ecfdf5", color: "#065f46" }}>{okMsg}</div>
      ) : null}

      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 16,
          display: "grid",
          gap: 10,
          marginBottom: 20,
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 16 }}>+ תבנית חדשה</div>
        <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
          שם באנגלית בפורמט snake_case מומלץ. גוף ההודעה יכול לכלול {"{{1}}"}, {"{{2}}"} — הוסיפו ערכי דוגמה מופרדים בפסיק.
        </p>
        <input
          value={tplName}
          onChange={(e) => setTplName(e.target.value)}
          placeholder="שם תבנית (למשל summer_sale_2026)"
          style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <select
            value={tplCategory}
            onChange={(e) => setTplCategory(e.target.value as "MARKETING" | "UTILITY" | "AUTHENTICATION")}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", minWidth: 160 }}
          >
            <option value="MARKETING">Marketing</option>
            <option value="UTILITY">Utility</option>
            <option value="AUTHENTICATION">Authentication</option>
          </select>
          <input
            value={tplLanguage}
            onChange={(e) => setTplLanguage(e.target.value)}
            placeholder="שפה (he)"
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", width: 120 }}
          />
        </div>
        <textarea
          value={tplBodyText}
          onChange={(e) => setTplBodyText(e.target.value)}
          placeholder="תוכן ההודעה"
          style={{
            minHeight: 120,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            resize: "vertical",
            fontFamily: "inherit",
          }}
        />
        <input
          value={tplExampleValues}
          onChange={(e) => setTplExampleValues(e.target.value)}
          placeholder="ערכי דוגמה לפלייסהולדרים (פסיק)"
          style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
        />
        <button
          type="button"
          onClick={() => void saveTemplate()}
          disabled={savingTemplate}
          style={{
            justifySelf: "start",
            padding: "10px 18px",
            borderRadius: 10,
            border: "none",
            background: "#2563eb",
            color: "#fff",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          {savingTemplate ? "שומר..." : "שמור תבנית"}
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <input
          value={tplSearch}
          onChange={(e) => setTplSearch(e.target.value)}
          placeholder="חיפוש לפי שם, שפה או קטגוריה..."
          style={{ flex: "1 1 240px", minWidth: 200, padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
        />
        <button
          type="button"
          onClick={() => void load()}
          style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", fontWeight: 600 }}
        >
          רענן
        </button>
      </div>

      {loading ? (
        <div style={{ color: "#6b7280" }}>טוען…</div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f9fafb", textAlign: "right" as const }}>
                <th style={{ padding: 12, fontWeight: 800, color: "#6b7280" }}>שם</th>
                <th style={{ padding: 12, fontWeight: 800, color: "#6b7280" }}>קטגוריה</th>
                <th style={{ padding: 12, fontWeight: 800, color: "#6b7280" }}>שפה</th>
                <th style={{ padding: 12, fontWeight: 800, color: "#6b7280" }}>סטטוס</th>
                <th style={{ padding: 12, fontWeight: 800, color: "#6b7280" }}>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 20, color: "#6b7280" }}>
                    אין תבניות או אין תוצאות חיפוש.
                  </td>
                </tr>
              ) : (
                filtered.map((t) => {
                  const st = statusLabel(t.status);
                  return (
                    <tr key={t.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                      <td style={{ padding: 12, fontWeight: 700 }}>{t.name}</td>
                      <td style={{ padding: 12 }}>{t.category}</td>
                      <td style={{ padding: 12 }}>{t.language}</td>
                      <td style={{ padding: 12, color: st.color, fontWeight: 700 }}>{st.text}</td>
                      <td style={{ padding: 12 }}>
                        <button
                          type="button"
                          onClick={() => void submitTemplate(t.id)}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 8,
                            border: "1px solid #bfdbfe",
                            background: "#eff6ff",
                            color: "#1d4ed8",
                            fontWeight: 700,
                            cursor: "pointer",
                            fontSize: 13,
                          }}
                        >
                          שלח לאישור במטא
                        </button>
                        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }} dir="ltr">
                          {t.updatedAt ? formatIsraelDateTime(t.updatedAt) : ""}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

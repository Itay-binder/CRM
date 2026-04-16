"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";
import { countBodyPlaceholders, type TemplateParamSource } from "@/lib/whatsapp/templateParams";

type TemplateVm = {
  id: string;
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language: string;
  bodyText: string;
  exampleValues: string[];
  parameterSources?: TemplateParamSource[];
  buttonRows?: Array<{ type: "QUICK_REPLY" | "URL"; text: string; url?: string }>;
  status: "draft" | "submitted" | "approved" | "rejected";
  metaTemplateId?: string;
  metaStatus?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
};

type BtnRow = { type: "QUICK_REPLY" | "URL"; text: string; url: string };

const SOURCE_LABELS: { value: TemplateParamSource; label: string }[] = [
  { value: "manual", label: "ידני (מהדיוור / דוגמה)" },
  { value: "name", label: "שם איש קשר" },
  { value: "phone", label: "טלפון" },
  { value: "email", label: "אימייל" },
  { value: "status", label: "סטטוס מכירה" },
  { value: "contactCode", label: "קוד איש קשר" },
  { value: "assignedRep", label: "נציג" },
];

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
  const [tplParameterSources, setTplParameterSources] = useState<TemplateParamSource[]>([]);
  const [tplButtonRows, setTplButtonRows] = useState<BtnRow[]>([]);
  const [tplSearch, setTplSearch] = useState("");

  const paramSlotCount = countBodyPlaceholders(tplBodyText);

  useEffect(() => {
    setTplParameterSources((prev) => {
      const n = countBodyPlaceholders(tplBodyText);
      const next = [...prev];
      while (next.length < n) next.push("manual");
      return next.slice(0, n);
    });
  }, [tplBodyText]);

  function insertBodyToken(n: number) {
    setTplBodyText((t) => `${t}{{${n}}}`);
  }

  function patchButtonRow(i: number, patch: Partial<BtnRow>) {
    setTplButtonRows((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

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
      const buttonRows = tplButtonRows
        .map((b) => ({
          type: b.type,
          text: b.text.trim().slice(0, 25),
          url: b.url.trim(),
        }))
        .filter((b) => {
          if (!b.text) return false;
          if (b.type === "URL") return Boolean(b.url);
          return true;
        })
        .slice(0, 3);

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
          parameterSources: tplParameterSources.slice(0, paramSlotCount),
          buttonRows,
        }),
      });
      const j = await parseJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "יצירת טמפלט נכשלה");
      setTplName("");
      setTplBodyText("");
      setTplExampleValues("");
      setTplParameterSources([]);
      setTplButtonRows([]);
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
          שם באנגלית בפורמט snake_case מומלץ. גוף ההודעה יכול לכלול {"{{1}}"}, {"{{2}}"} — הוסיפו ערכי דוגמה מופרדים בפסיק
          (לאישור במטא). למטה אפשר לבחור מאיזה שדה ב-CRM נמלא כל מקום — או ידני מהדיוור.
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>הוסף מציין מיקום:</span>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => insertBodyToken(n)}
              style={{
                padding: "4px 10px",
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                background: "#f8fafc",
                fontSize: 13,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {`{{${n}}}`}
            </button>
          ))}
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
        {paramSlotCount > 0 ? (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>מקור נתונים לכל {"{{n}}"} (CRM)</div>
            {Array.from({ length: paramSlotCount }, (_, i) => (
              <label
                key={i}
                style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", fontSize: 13 }}
              >
                <span style={{ minWidth: 72, fontWeight: 600 }}>{`{{${i + 1}}}`}</span>
                <select
                  value={tplParameterSources[i] ?? "manual"}
                  onChange={(e) => {
                    const v = e.target.value as TemplateParamSource;
                    setTplParameterSources((prev) => {
                      const next = [...prev];
                      while (next.length <= i) next.push("manual");
                      next[i] = v;
                      return next;
                    });
                  }}
                  style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", minWidth: 220 }}
                >
                  {SOURCE_LABELS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        ) : null}
        <input
          value={tplExampleValues}
          onChange={(e) => setTplExampleValues(e.target.value)}
          placeholder="ערכי דוגמה לפלייסהולדרים (פסיק) — נדרש לאישור במטא"
          style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
        />
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>כפתורים (עד 3 — Quick Reply / URL)</div>
          <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
            טקסט כפתור עד 25 תווים. URL מלא לכפתור קישור (ללא משתני דינמיקה בכתובת בגרסה זו).
          </p>
          {tplButtonRows.map((row, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "center",
                padding: 10,
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fafafa",
              }}
            >
              <select
                value={row.type}
                onChange={(e) =>
                  patchButtonRow(i, {
                    type: e.target.value as "QUICK_REPLY" | "URL",
                    url: e.target.value === "URL" ? row.url : "",
                  })
                }
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
              >
                <option value="QUICK_REPLY">Quick Reply</option>
                <option value="URL">URL</option>
              </select>
              <input
                value={row.text}
                onChange={(e) => patchButtonRow(i, { text: e.target.value })}
                placeholder="טקסט הכפתור"
                maxLength={25}
                style={{ flex: "1 1 160px", padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
              />
              {row.type === "URL" ? (
                <input
                  value={row.url}
                  onChange={(e) => patchButtonRow(i, { url: e.target.value })}
                  placeholder="https://..."
                  dir="ltr"
                  style={{ flex: "2 1 220px", padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
                />
              ) : null}
              <button
                type="button"
                onClick={() => setTplButtonRows((rows) => rows.filter((_, j) => j !== i))}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #fecaca",
                  background: "#fff",
                  color: "#b91c1c",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                הסר
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={tplButtonRows.length >= 3}
            onClick={() =>
              setTplButtonRows((rows) => [...rows, { type: "QUICK_REPLY", text: "", url: "" }])
            }
            style={{
              justifySelf: "start",
              padding: "8px 14px",
              borderRadius: 10,
              border: "1px dashed #cbd5e1",
              background: "#f8fafc",
              fontWeight: 700,
              cursor: tplButtonRows.length >= 3 ? "not-allowed" : "pointer",
            }}
          >
            + כפתור
          </button>
        </div>
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

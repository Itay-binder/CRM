"use client";

import { useCallback, useState } from "react";

const CTA_OPTIONS: { v: "LEARN_MORE" | "SHOP_NOW" | "SIGN_UP" | "APPLY_NOW" | "GET_QUOTE"; l: string }[] = [
  { v: "LEARN_MORE", l: "למד עוד" },
  { v: "SHOP_NOW", l: "קנה עכשיו" },
  { v: "SIGN_UP", l: "הרשם" },
  { v: "APPLY_NOW", l: "הגש" },
  { v: "GET_QUOTE", l: "הצעת מחיר" },
];

type Props = {
  canManage: boolean;
  tokenConnected: boolean;
  hasAdAccount: boolean;
};

export default function MetaAdsCreateWizard({ canManage, tokenConnected, hasAdAccount }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [resIds, setResIds] = useState<{
    campaignId?: string;
    adSetId?: string;
    creativeId?: string;
    adId?: string;
  } | null>(null);

  const submit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setErr(null);
      setOk(null);
      setResIds(null);
      setBusy(true);
      const fd = new FormData(e.currentTarget);
      try {
        const r = await fetch("/api/meta-ads/create-traffic-campaign", {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        const j = (await r.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          result?: { campaignId: string; adSetId: string; creativeId: string; adId: string };
        };
        if (!r.ok || !j.ok) {
          setErr(j.error || "בקשה נכשלה");
        } else {
          setOk("הקמפיין נוצר ב־Meta. בדקו ב־Ads Manager; אם סטטוס «מושהה»—הפעילו משם.");
          setResIds(
            j.result
              ? {
                  campaignId: j.result.campaignId,
                  adSetId: j.result.adSetId,
                  creativeId: j.result.creativeId,
                  adId: j.result.adId,
                }
              : null
          );
        }
      } catch (ex) {
        setErr(ex instanceof Error ? ex.message : "שגיאה");
      } finally {
        setBusy(false);
      }
    },
    []
  );

  if (!canManage) return null;

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 16,
        marginTop: 16,
      }}
    >
      <button
        type="button"
        onClick={() => { setOpen(!open); setErr(null); setOk(null); setResIds(null); }}
        style={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          background: "linear-gradient(180deg, #0ea5e9 0%, #0284c7 100%)",
          color: "#fff",
          border: "none",
          borderRadius: 12,
          padding: "12px 16px",
          fontWeight: 800,
          fontSize: 15,
          cursor: "pointer",
        }}
      >
        <span>קמפיין חדש — תנועה + תמונה (Advantage+ קהל, ללא שיפורי AI לקריאייטיב)</span>
        <span style={{ fontSize: 12, opacity: 0.9 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
          {(!tokenConnected || !hasAdAccount) && (
            <p style={{ margin: 0, color: "#b45309", fontSize: 13, lineHeight: 1.5 }}>
              ! חייב <strong>חיבור Meta</strong> + <strong>Ad Account</strong> + טוקן תקף. יעד:{" "}
              <strong>תנות לאתר</strong> (קליקים). קהל: Advantage+ (מופעל).{" "}
              <strong>שיפורי AI לתמונות/קופי</strong> — כוונתנו: opt-out לפי <code>degrees_of_freedom_spec</code>{" "}
              (ייתכן שמטא ישנו שמות שדות בין גרסאות).
            </p>
          )}

          <form onSubmit={(ev) => void submit(ev)} style={{ display: "grid", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }} dir="ltr">
              <strong>Page ID</strong> — מזהה מספרי של עמוד ה-Facebook/Instagram הממוסחר (העתקה מ-Page Settings
              / Business Suite).
            </p>
            <input
              name="pageId"
              required
              dir="ltr"
              placeholder="Page ID (למשל 123456789012345)"
              style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
            />
            <input
              name="name"
              required
              placeholder="שם קמפיין (יופיע ב-Meta)"
              style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
            />
            <input
              name="linkUrl"
              type="url"
              required
              dir="ltr"
              placeholder="https://... (נחיתה)"
              style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
            />
            <input
              name="urlTags"
              dir="ltr"
              placeholder="פרמטרי UTM (ללא ?) — לדוגמה utm_source=crm&amp;utm_medium=cpc"
              style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
            />
            <textarea
              name="primaryText"
              required
              rows={3}
              placeholder="טקסט ראשי של המודעה"
              style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
            />
            <input
              name="headline"
              required
              placeholder="כותרת (שורת קישור)"
              style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
            />
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>CTA</span>
              <select
                name="ctaType"
                defaultValue="LEARN_MORE"
                style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
              >
                {CTA_OPTIONS.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.l} ({o.v})
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>תמונת מודעה (JPG/PNG, עד 30MB)</span>
              <input
                name="image"
                type="file"
                required
                accept="image/jpeg,image/png,image/jpg,image/webp"
              />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label>
                <span style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>תקציב יומי</span>
                <input
                  name="dailyBudget"
                  type="number"
                  min={1}
                  step="0.01"
                  required
                  defaultValue="50"
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                />
              </label>
              <label>
                <span style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  יעד עלות/תוצאה (אופציונלי, bid cap)
                </span>
                <input
                  name="costCapPerResult"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="—"
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                />
              </label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label>
                <span style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>מגיל (מינ׳ 18)</span>
                <input
                  name="ageMin"
                  type="number"
                  min={18}
                  max={65}
                  defaultValue="18"
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                />
              </label>
              <label>
                <span style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>עד גיל (מקס׳ 65)</span>
                <input
                  name="ageMax"
                  type="number"
                  min={18}
                  max={65}
                  defaultValue="55"
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                />
              </label>
            </div>
            <input
              name="countryCodes"
              defaultValue="IL"
              dir="ltr"
              placeholder="מדינות (IL או US,IL)"
              style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
            />
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>מצב התחלה</span>
              <select
                name="startActive"
                defaultValue="false"
                style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
              >
                <option value="false">מושהה (מומלץ — להפעלה מ-Ads Manager)</option>
                <option value="true">פעיל (מתחיל לרוץ)</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={busy}
              style={{
                padding: "12px 18px",
                borderRadius: 10,
                border: "none",
                background: "#059669",
                color: "#fff",
                fontWeight: 800,
                cursor: busy ? "wait" : "pointer",
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? "יוצר…" : "צור ב-Meta"}
            </button>
          </form>
          {err && (
            <p style={{ margin: 0, color: "#b91c1c", fontSize: 13, whiteSpace: "pre-wrap" }}>{err}</p>
          )}
          {ok && <p style={{ margin: 0, color: "#047857", fontSize: 13 }}>{ok}</p>}
          {resIds && (
            <p style={{ margin: 0, fontSize: 12, color: "#374151", lineHeight: 1.5 }} dir="ltr">
              campaign: {resIds.campaignId} · adset: {resIds.adSetId} · creative: {resIds.creativeId} · ad:{" "}
              {resIds.adId}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

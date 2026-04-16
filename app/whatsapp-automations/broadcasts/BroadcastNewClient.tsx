"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { AudienceCondition, AudienceLogic } from "@/lib/whatsapp/audienceFilter";

type TemplateVm = {
  id: string;
  name: string;
  category: string;
  language: string;
  status: string;
};

type LabelOpt = { id: string; name: string };

type DraftVm = {
  id: string;
  name: string;
  templateId: string;
  parameterValues: string[];
  conditions: AudienceCondition[];
  logic: AudienceLogic;
};

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

function newCond(): AudienceCondition {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `c-${Date.now()}`,
    field: "name",
    op: "contains",
    value: "",
  };
}

const OPS_BY_FIELD: Record<
  AudienceCondition["field"],
  AudienceCondition["op"][]
> = {
  tag: ["hasTag", "notHasTag"],
  name: ["contains", "notContains", "equals", "notEquals", "isEmpty", "notEmpty"],
  phone: ["contains", "notContains", "equals", "notEquals", "isEmpty", "notEmpty"],
  email: ["contains", "notContains", "equals", "notEquals", "isEmpty", "notEmpty"],
  status: ["equals", "notEquals"],
};

export default function BroadcastNewClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftQ = searchParams.get("draft")?.trim() ?? "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [templates, setTemplates] = useState<TemplateVm[]>([]);
  const [labels, setLabels] = useState<LabelOpt[]>([]);
  const [tplSearch, setTplSearch] = useState("");

  const [broadcastName, setBroadcastName] = useState("דיוור ללא שם");
  const [templateId, setTemplateId] = useState("");
  const [parameterValuesStr, setParameterValuesStr] = useState("");
  const [logic, setLogic] = useState<AudienceLogic>("and");
  const [conditions, setConditions] = useState<AudienceCondition[]>([]);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);

  const loadBase = useCallback(async () => {
    const [tRes, lRes] = await Promise.all([
      fetch("/api/whatsapp/templates", { credentials: "include", cache: "no-store" }),
      fetch("/api/labels", { credentials: "include", cache: "no-store" }),
    ]);
    if (tRes.status === 401) {
      window.location.href = `/login?returnTo=${encodeURIComponent("/whatsapp-automations/broadcasts/new")}`;
      return;
    }
    const tj = await parseJson<{ ok?: boolean; templates?: TemplateVm[] }>(tRes);
    const lj = await parseJson<{ ok?: boolean; labels?: LabelOpt[] }>(lRes);
    if (tj.ok) setTemplates(tj.templates ?? []);
    if (lj.ok) setLabels(lj.labels ?? []);
  }, []);

  const loadDraft = useCallback(async () => {
    if (!draftQ) return;
    const res = await fetch("/api/whatsapp/broadcasts/drafts", { credentials: "include", cache: "no-store" });
    const j = await parseJson<{ ok?: boolean; drafts?: DraftVm[] }>(res);
    if (!j.ok || !j.drafts) return;
    const d = j.drafts.find((x) => x.id === draftQ);
    if (!d) return;
    setDraftId(d.id);
    setBroadcastName(d.name);
    setTemplateId(d.templateId);
    setParameterValuesStr(d.parameterValues.join(", "));
    setLogic(d.logic);
    setConditions(d.conditions.length ? d.conditions : []);
  }, [draftQ]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        await loadBase();
        await loadDraft();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "שגיאה");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadBase, loadDraft]);

  const filteredTemplates = useMemo(() => {
    const q = tplSearch.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.language.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
    );
  }, [templates, tplSearch]);

  const selectedTpl = templates.find((t) => t.id === templateId);

  async function runPreview() {
    setErr(null);
    setPreviewCount(null);
    try {
      const res = await fetch("/api/whatsapp/audience/preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conditions, logic }),
      });
      const j = await parseJson<{ ok?: boolean; count?: number; error?: string }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "תצוגה מקדימה נכשלה");
      setPreviewCount(typeof j.count === "number" ? j.count : 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    }
  }

  async function saveDraft() {
    setSaving(true);
    setErr(null);
    setOkMsg(null);
    try {
      const parameterValues = parameterValuesStr
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      const body = {
        id: draftId ?? undefined,
        name: broadcastName.trim() || "טיוטה",
        templateId,
        parameterValues,
        conditions,
        logic,
      };
      const res = await fetch("/api/whatsapp/broadcasts/drafts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await parseJson<{ ok?: boolean; draft?: { id: string }; error?: string }>(res);
      if (!res.ok || !j.ok || !j.draft) throw new Error(j.error || "שמירת טיוטה נכשלה");
      setDraftId(j.draft.id);
      setOkMsg("הטיוטה נשמרה.");
      router.replace(`/whatsapp-automations/broadcasts/new?draft=${encodeURIComponent(j.draft.id)}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  async function sendBroadcast() {
    setSending(true);
    setErr(null);
    setOkMsg(null);
    try {
      const parameterValues = parameterValuesStr
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      const body: Record<string, unknown> = {
        broadcastName: broadcastName.trim() || undefined,
        templateId,
        parameterValues,
        conditions,
        logic,
      };
      if (draftId) {
        body.draftId = draftId;
      }
      const res = await fetch("/api/whatsapp/campaigns/send", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await parseJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "שליחה נכשלה");
      setOkMsg("הדיוור נשלח. עוברים להיסטוריה.");
      router.push("/whatsapp-automations");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שליחה נכשלה");
    } finally {
      setSending(false);
    }
  }

  function patchCondition(id: string, patch: Partial<AudienceCondition>) {
    setConditions((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function addCondition() {
    setConditions((prev) => [...prev, newCond()]);
  }

  function removeCondition(id: string) {
    setConditions((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <Link href="/whatsapp-automations" style={{ color: "#2563eb", fontWeight: 700, fontSize: 14 }}>
          ← חזרה לברודקאסטים
        </Link>
      </div>

      {err ? (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b" }}>{err}</div>
      ) : null}
      {okMsg ? (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: "#ecfdf5", color: "#065f46" }}>{okMsg}</div>
      ) : null}

      {loading ? (
        <div style={{ color: "#6b7280" }}>טוען…</div>
      ) : (
        <div style={{ display: "grid", gap: 20 }}>
          <section
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              padding: 18,
            }}
          >
            <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 900 }}>תוכן</h2>
            <input
              value={broadcastName}
              onChange={(e) => setBroadcastName(e.target.value)}
              placeholder="שם הדיוור"
              style={{ width: "100%", maxWidth: 420, padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", marginBottom: 12 }}
            />
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>בחר תבנית מאושרת/קיימת</div>
            <input
              value={tplSearch}
              onChange={(e) => setTplSearch(e.target.value)}
              placeholder="חיפוש תבנית לפי שם, שפה..."
              style={{ width: "100%", maxWidth: 420, padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", marginBottom: 8 }}
            />
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              style={{ width: "100%", maxWidth: 520, padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", marginBottom: 8 }}
            >
              <option value="">— בחר תבנית —</option>
              {filteredTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.category} · {t.language} ({t.status})
                </option>
              ))}
            </select>
            <div style={{ fontSize: 13, marginBottom: 12 }}>
              <Link href="/whatsapp-automations/templates" style={{ color: "#2563eb", fontWeight: 700 }}>
                כל התבניות / יצירת תבנית חדשה
              </Link>
            </div>
            <label style={{ display: "block", fontWeight: 700, fontSize: 13, marginBottom: 6 }}>פרמטרים לגוף התבנית (פסיקים לפי {"{{1}}"}, {"{{2}}"}…)</label>
            <input
              value={parameterValuesStr}
              onChange={(e) => setParameterValuesStr(e.target.value)}
              placeholder="למשל: ישראל, 100"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
            />
            {selectedTpl && selectedTpl.status !== "approved" ? (
              <p style={{ fontSize: 12, color: "#b45309", marginTop: 8 }}>
                התבנית לא מסומנת כ-approved — Meta עלולה לחסום שליחה עד לאישור.
              </p>
            ) : null}
          </section>

          <section
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              padding: 18,
            }}
          >
            <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 900 }}>קהל יעד</h2>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
              הוסף תנאים (תגית, שם, טלפון וכו׳). בלי תנאים — נשלח לכל אנשי הקשר (עד מגבלת המערכת). לוגיקה בין תנאים:
            </p>
            <select
              value={logic}
              onChange={(e) => setLogic(e.target.value as AudienceLogic)}
              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", marginBottom: 12 }}
            >
              <option value="and">וגם (AND)</option>
              <option value="or">או (OR)</option>
            </select>

            <div style={{ display: "grid", gap: 10 }}>
              {conditions.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1.2fr auto",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <select
                    value={c.field}
                    onChange={(e) => {
                      const field = e.target.value as AudienceCondition["field"];
                      const ops = OPS_BY_FIELD[field];
                      patchCondition(c.id, { field, op: ops[0], value: "" });
                    }}
                    style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
                  >
                    <option value="tag">תגית</option>
                    <option value="name">שם</option>
                    <option value="phone">טלפון</option>
                    <option value="email">אימייל</option>
                    <option value="status">סטטוס</option>
                  </select>
                  <select
                    value={c.op}
                    onChange={(e) => patchCondition(c.id, { op: e.target.value as AudienceCondition["op"] })}
                    style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
                  >
                    {(OPS_BY_FIELD[c.field] ?? OPS_BY_FIELD.name).map((op) => (
                      <option key={op} value={op}>
                        {op}
                      </option>
                    ))}
                  </select>
                  {c.field === "tag" ? (
                    <select
                      value={c.value}
                      onChange={(e) => patchCondition(c.id, { value: e.target.value })}
                      style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
                    >
                      <option value="">בחר תגית</option>
                      {labels.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  ) : c.field === "status" ? (
                    <select
                      value={c.value}
                      onChange={(e) => patchCondition(c.id, { value: e.target.value })}
                      style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
                    >
                      <option value="פתוח">פתוח</option>
                      <option value="זכיה">זכיה</option>
                      <option value="הפסד">הפסד</option>
                    </select>
                  ) : (
                    <input
                      value={c.value}
                      onChange={(e) => patchCondition(c.id, { value: e.target.value })}
                      placeholder="ערך"
                      disabled={c.op === "isEmpty" || c.op === "notEmpty"}
                      style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => removeCondition(c.id)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #fecaca",
                      background: "#fff",
                      color: "#b91c1c",
                      cursor: "pointer",
                    }}
                  >
                    הסר
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12, alignItems: "center" }}>
              <button
                type="button"
                onClick={addCondition}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: "1px dashed #cbd5e1",
                  background: "#f8fafc",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                + תנאי
              </button>
              <button
                type="button"
                onClick={() => void runPreview()}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: "1px solid #bae6fd",
                  background: "#f0f9ff",
                  fontWeight: 700,
                  cursor: "pointer",
                  color: "#0369a1",
                }}
              >
                תצוגה מקדימה: כמה אנשי קשר
              </button>
              {previewCount !== null ? (
                <span style={{ fontWeight: 800, color: "#0f766e" }}>{previewCount} אנשי קשר תואמים</span>
              ) : null}
            </div>
          </section>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button
              type="button"
              onClick={() => void saveDraft()}
              disabled={saving || !templateId}
              style={{
                padding: "12px 20px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
                fontWeight: 800,
                cursor: saving ? "wait" : "pointer",
              }}
            >
              {saving ? "שומר…" : "שמור טיוטה"}
            </button>
            <button
              type="button"
              onClick={() => void sendBroadcast()}
              disabled={sending || !templateId}
              style={{
                padding: "12px 22px",
                borderRadius: 10,
                border: "none",
                background: "#2563eb",
                color: "#fff",
                fontWeight: 800,
                cursor: sending ? "wait" : "pointer",
              }}
            >
              {sending ? "שולח…" : "שלח דיוור"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

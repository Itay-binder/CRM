"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import type { AudienceCondition, AudienceLogic } from "@/lib/whatsapp/audienceFilter";

type AudienceMode = "filters" | "contact_ids";

type AudienceVm = {
  id: string;
  name: string;
  mode: AudienceMode;
  conditions: AudienceCondition[];
  logic: AudienceLogic;
  contactIds: string[];
  sourceCampaignId?: string;
  sourceCampaignName?: string;
  updatedAt: string;
  createdBy: string;
};

type CampaignVm = {
  id: string;
  broadcastName?: string;
  templateName: string;
  createdAt: string;
  recipientCount: number;
};

type LabelOpt = { id: string; name: string };

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

const OPS_BY_FIELD: Record<AudienceCondition["field"], AudienceCondition["op"][]> = {
  tag: ["hasTag", "notHasTag"],
  name: ["contains", "notContains", "equals", "notEquals", "isEmpty", "notEmpty"],
  phone: ["contains", "notContains", "equals", "notEquals", "isEmpty", "notEmpty"],
  email: ["contains", "notContains", "equals", "notEquals", "isEmpty", "notEmpty"],
  status: ["equals", "notEquals"],
};

export default function AudiencesClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [audiences, setAudiences] = useState<AudienceVm[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignVm[]>([]);
  const [labels, setLabels] = useState<LabelOpt[]>([]);

  const [name, setName] = useState("");
  const [mode, setMode] = useState<AudienceMode>("filters");
  const [logic, setLogic] = useState<AudienceLogic>("and");
  const [conditions, setConditions] = useState<AudienceCondition[]>([]);
  const [sourceCampaignId, setSourceCampaignId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [aRes, cRes, lRes] = await Promise.all([
        fetch("/api/whatsapp/audiences", { credentials: "include", cache: "no-store" }),
        fetch("/api/whatsapp/campaigns/send", { credentials: "include", cache: "no-store" }),
        fetch("/api/labels", { credentials: "include", cache: "no-store" }),
      ]);
      if (aRes.status === 401) {
        window.location.href = `/login?returnTo=${encodeURIComponent("/whatsapp-automations/audiences")}`;
        return;
      }
      const aj = await parseJson<{ ok?: boolean; audiences?: AudienceVm[]; error?: string }>(aRes);
      const cj = await parseJson<{ ok?: boolean; campaigns?: CampaignVm[]; error?: string }>(cRes);
      const lj = await parseJson<{ ok?: boolean; labels?: LabelOpt[] }>(lRes);
      if (!aj.ok) throw new Error(aj.error || "טעינת קהלים נכשלה");
      if (!cj.ok) throw new Error(cj.error || "טעינת דיוורים נכשלה");
      setAudiences(aj.audiences ?? []);
      setCampaigns(cj.campaigns ?? []);
      if (lj.ok) setLabels(lj.labels ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setMode("filters");
    setLogic("and");
    setConditions([]);
    setSourceCampaignId("");
  }

  function editAudience(a: AudienceVm) {
    setEditingId(a.id);
    setName(a.name);
    setMode(a.mode);
    setLogic(a.logic);
    setConditions(a.conditions ?? []);
    setSourceCampaignId(a.sourceCampaignId ?? "");
  }

  function patchCondition(id: string, patch: Partial<AudienceCondition>) {
    setConditions((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function saveAudience() {
    setSaving(true);
    setErr(null);
    setOkMsg(null);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim() || (mode === "filters" ? "קהל לפי תנאים" : "קהל מדיוור"),
        mode,
        ...(editingId ? { id: editingId } : {}),
      };
      if (mode === "contact_ids") {
        if (!sourceCampaignId.trim()) throw new Error("בחרו דיוור מקור.");
        payload.sourceCampaignId = sourceCampaignId.trim();
      } else {
        payload.logic = logic;
        payload.conditions = conditions;
      }
      const res = await fetch("/api/whatsapp/audiences", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await parseJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "שמירת קהל נכשלה");
      setOkMsg("הקהל נשמר.");
      resetForm();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  async function removeAudience(id: string) {
    if (!window.confirm("למחוק את הקהל?")) return;
    setErr(null);
    try {
      const res = await fetch(`/api/whatsapp/audiences/${encodeURIComponent(id)}`, {
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

  const campaignOptions = useMemo(
    () =>
      campaigns.map((c) => ({
        id: c.id,
        label: `${c.broadcastName?.trim() || c.templateName} · ${c.recipientCount} נמענים`,
      })),
    [campaigns]
  );

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {err ? (
        <div style={{ padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b" }}>{err}</div>
      ) : null}
      {okMsg ? (
        <div style={{ padding: 12, borderRadius: 10, background: "#ecfdf5", color: "#065f46" }}>{okMsg}</div>
      ) : null}

      <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 900 }}>
          {editingId ? "עריכת קהל" : "קהל חדש"}
        </h2>
        <div style={{ display: "grid", gap: 10 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="שם הקהל"
            style={{ maxWidth: 440, padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setMode("filters")}
              style={modeBtn(mode === "filters")}
            >
              לפי תנאים
            </button>
            <button
              type="button"
              onClick={() => setMode("contact_ids")}
              style={modeBtn(mode === "contact_ids")}
            >
              מתוך דיוור עבר
            </button>
          </div>

          {mode === "contact_ids" ? (
            <select
              value={sourceCampaignId}
              onChange={(e) => setSourceCampaignId(e.target.value)}
              style={{ maxWidth: 580, padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
            >
              <option value="">— בחר דיוור מקור —</option>
              {campaignOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          ) : (
            <>
              <select
                value={logic}
                onChange={(e) => setLogic(e.target.value as AudienceLogic)}
                style={{ maxWidth: 220, padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              >
                <option value="and">וגם (AND)</option>
                <option value="or">או (OR)</option>
              </select>
              <div style={{ display: "grid", gap: 8 }}>
                {conditions.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1.2fr auto",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <select
                      value={c.field}
                      onChange={(e) => {
                        const field = e.target.value as AudienceCondition["field"];
                        patchCondition(c.id, { field, op: OPS_BY_FIELD[field][0], value: "" });
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
                      onClick={() => setConditions((prev) => prev.filter((x) => x.id !== c.id))}
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
              <button
                type="button"
                onClick={() => setConditions((prev) => [...prev, newCond()])}
                style={{
                  maxWidth: 140,
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px dashed #cbd5e1",
                  background: "#f8fafc",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                + תנאי
              </button>
            </>
          )}
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => void saveAudience()}
            disabled={saving}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontWeight: 800,
              cursor: saving ? "wait" : "pointer",
            }}
          >
            {saving ? "שומר..." : editingId ? "עדכן קהל" : "שמור קהל"}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              בטל עריכה
            </button>
          ) : null}
        </div>
      </section>

      <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #f3f4f6", fontWeight: 900, fontSize: 16 }}>
          קהלים שמורים
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr>
                <th style={th}>שם</th>
                <th style={th}>סוג</th>
                <th style={th}>מקור</th>
                <th style={th}>עדכון אחרון</th>
                <th style={th}>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ ...td, color: "#6b7280" }}>
                    טוען...
                  </td>
                </tr>
              ) : audiences.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ ...td, color: "#6b7280" }}>
                    עדיין לא שמרת קהלים.
                  </td>
                </tr>
              ) : (
                audiences.map((a) => (
                  <tr key={a.id}>
                    <td style={{ ...td, fontWeight: 700 }}>{a.name}</td>
                    <td style={td}>{a.mode === "contact_ids" ? "מדיוור קודם" : "תנאים"}</td>
                    <td style={td}>{a.sourceCampaignName || (a.mode === "filters" ? "—" : "קמפיין קיים")}</td>
                    <td style={{ ...td, fontSize: 12 }} dir="ltr">
                      {a.updatedAt || "—"}
                    </td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button type="button" onClick={() => editAudience(a)} style={actionBtn}>
                          ערוך
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeAudience(a.id)}
                          style={{ ...actionBtn, borderColor: "#fecaca", color: "#b91c1c" }}
                        >
                          מחק
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function modeBtn(active: boolean): CSSProperties {
  return {
    padding: "8px 12px",
    borderRadius: 999,
    border: active ? "1px solid #bfdbfe" : "1px solid #e5e7eb",
    background: active ? "#eff6ff" : "#fff",
    color: active ? "#1d4ed8" : "#374151",
    fontWeight: 700,
    cursor: "pointer",
  };
}

const th = {
  textAlign: "right" as const,
  padding: "10px 8px",
  borderBottom: "2px solid #e5e7eb",
  color: "#6b7280",
  fontWeight: 800,
};

const td = {
  padding: "10px 8px",
  borderBottom: "1px solid #f3f4f6",
  verticalAlign: "top" as const,
};

const actionBtn: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#1f2937",
  fontWeight: 700,
  cursor: "pointer",
};

"use client";

import { useEffect, useState } from "react";

type EntityType = "contact" | "opportunity";
type FieldType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "boolean"
  | "phone"
  | "email";

type CustomField = {
  id: string;
  fieldId: string;
  entityType: EntityType;
  label: string;
  type: FieldType;
  options?: string[];
  isRequired: boolean;
  isActive: boolean;
};

type FieldScope = "all" | EntityType;
type SystemField = {
  kind: "system";
  entityType: EntityType;
  label: string;
  fieldId: string;
  type: FieldType | "readonly";
  isRequired: boolean;
  isActive: boolean;
  options?: string[];
};

const CONTACT_SYSTEM_FIELDS: SystemField[] = [
  { kind: "system", entityType: "contact", label: "שם מלא", fieldId: "contact_name", type: "text", isRequired: true, isActive: true },
  { kind: "system", entityType: "contact", label: "מייל", fieldId: "contact_email", type: "email", isRequired: false, isActive: true },
  { kind: "system", entityType: "contact", label: "פלאפון", fieldId: "contact_phone", type: "phone", isRequired: false, isActive: true },
  { kind: "system", entityType: "contact", label: "סטטוס", fieldId: "contact_status", type: "select", isRequired: false, isActive: true, options: ["פתוח", "זכיה", "הפסד"] },
  { kind: "system", entityType: "contact", label: "נציג משויך", fieldId: "contact_assigned_rep", type: "select", isRequired: false, isActive: true },
  { kind: "system", entityType: "contact", label: "תאריך יצירה", fieldId: "contact_created_at", type: "readonly", isRequired: false, isActive: true },
];

const OPPORTUNITY_SYSTEM_FIELDS: SystemField[] = [
  { kind: "system", entityType: "opportunity", label: "שם הזדמנות", fieldId: "opportunity_name", type: "text", isRequired: true, isActive: true },
  { kind: "system", entityType: "opportunity", label: "פייפליין", fieldId: "opportunity_pipeline_id", type: "select", isRequired: true, isActive: true },
  { kind: "system", entityType: "opportunity", label: "שלב בפייפליין", fieldId: "opportunity_stage", type: "select", isRequired: true, isActive: true },
  { kind: "system", entityType: "opportunity", label: "סטטוס", fieldId: "opportunity_status", type: "select", isRequired: false, isActive: true, options: ["פתוח", "זכיה", "הפסד"] },
  { kind: "system", entityType: "opportunity", label: "נציג משויך", fieldId: "opportunity_assigned_rep", type: "select", isRequired: false, isActive: true },
  { kind: "system", entityType: "opportunity", label: "מייל", fieldId: "opportunity_email", type: "email", isRequired: false, isActive: true },
  { kind: "system", entityType: "opportunity", label: "פלאפון", fieldId: "opportunity_phone", type: "phone", isRequired: false, isActive: true },
  { kind: "system", entityType: "opportunity", label: "utm_source", fieldId: "opportunity_utm_source", type: "text", isRequired: false, isActive: true },
  { kind: "system", entityType: "opportunity", label: "utm_campaign", fieldId: "opportunity_utm_campaign", type: "text", isRequired: false, isActive: true },
  { kind: "system", entityType: "opportunity", label: "utm_medium", fieldId: "opportunity_utm_medium", type: "text", isRequired: false, isActive: true },
  { kind: "system", entityType: "opportunity", label: "utm_content", fieldId: "opportunity_utm_content", type: "text", isRequired: false, isActive: true },
  { kind: "system", entityType: "opportunity", label: "landingpage", fieldId: "opportunity_landingpage", type: "text", isRequired: false, isActive: true },
  { kind: "system", entityType: "opportunity", label: "תגיות", fieldId: "opportunity_tags", type: "select", isRequired: false, isActive: true },
  { kind: "system", entityType: "opportunity", label: "תאריך יצירה", fieldId: "opportunity_created_at", type: "readonly", isRequired: false, isActive: true },
  { kind: "system", entityType: "opportunity", label: "תאריך עדכון", fieldId: "opportunity_updated_at", type: "readonly", isRequired: false, isActive: true },
  { kind: "system", entityType: "opportunity", label: "תאריך ליד אחרון", fieldId: "opportunity_last_lead_at", type: "readonly", isRequired: false, isActive: true },
];

export default function FieldsClient() {
  const [scope, setScope] = useState<FieldScope>("all");
  const [entityType, setEntityType] = useState<EntityType>("contact");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<CustomField[]>([]);

  const [label, setLabel] = useState("");
  const [fieldId, setFieldId] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [optionsText, setOptionsText] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [deletingFieldId, setDeletingFieldId] = useState<string | null>(null);
  const [normalizingIds, setNormalizingIds] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/custom-fields`,
        {
          credentials: "include",
          cache: "no-store",
        }
      );
      if (res.status === 401) {
        window.location.href = `/login?returnTo=${encodeURIComponent(
          "/settings/fields"
        )}`;
        return;
      }
      if (res.status === 403) {
        window.location.href = `/pending?returnTo=${encodeURIComponent(
          "/settings/fields"
        )}`;
        return;
      }
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        fields?: CustomField[];
      };
      if (!j.ok) {
        setErr(j.error ?? "שגיאה בטעינת שדות");
        return;
      }
      setRows(j.fields ?? []);
    } catch {
      setErr("שגיאה בטעינת שדות");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setEditingFieldId(null);
    setLabel("");
    setFieldId("");
    setType("text");
    setOptionsText("");
    setIsRequired(false);
    setIsActive(true);
  }

  async function saveField() {
    setSaving(true);
    setErr(null);
    try {
      const options =
        type === "select"
          ? optionsText
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [];

      const res = await fetch("/api/custom-fields", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldId: fieldId || undefined,
          entityType,
          label,
          type,
          options,
          isRequired,
          isActive,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "שמירת שדה נכשלה");
        return;
      }
      resetForm();
      await load();
    } catch {
      setErr("שמירת שדה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  async function removeField(fieldIdToDelete: string) {
    const ok = window.confirm(`למחוק את השדה "${fieldIdToDelete}"?`);
    if (!ok) return;
    setDeletingFieldId(fieldIdToDelete);
    setErr(null);
    try {
      const res = await fetch("/api/custom-fields", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldId: fieldIdToDelete }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "מחיקת שדה נכשלה");
        return;
      }
      if (editingFieldId === fieldIdToDelete) resetForm();
      await load();
    } catch {
      setErr("מחיקת שדה נכשלה");
    } finally {
      setDeletingFieldId(null);
    }
  }

  async function normalizeFieldIds() {
    const ok = window.confirm(
      "לסדר את מזהי השדות לפורמט contact_xxx / opportunity_xxx?\nהפעולה תעדכן גם נתונים קיימים."
    );
    if (!ok) return;
    setNormalizingIds(true);
    setErr(null);
    try {
      const res = await fetch("/api/custom-fields", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "normalize_ids" }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        result?: { updatedFields: number; touchedContacts: number; touchedOpportunities: number };
      };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "סידור מזהים נכשל");
        return;
      }
      await load();
      const updated = j.result?.updatedFields ?? 0;
      const contacts = j.result?.touchedContacts ?? 0;
      const opps = j.result?.touchedOpportunities ?? 0;
      window.alert(`סידור הושלם: ${updated} שדות, ${contacts} אנשי קשר, ${opps} הזדמנויות.`);
    } catch {
      setErr("סידור מזהים נכשל");
    } finally {
      setNormalizingIds(false);
    }
  }

  function startEditField(f: CustomField) {
    setEditingFieldId(f.fieldId);
    setEntityType(f.entityType);
    setLabel(f.label);
    setFieldId(f.fieldId);
    setType(f.type);
    setOptionsText((f.options ?? []).join(", "));
    setIsRequired(f.isRequired);
    setIsActive(f.isActive);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const systemRows: SystemField[] = [...CONTACT_SYSTEM_FIELDS, ...OPPORTUNITY_SYSTEM_FIELDS];
  const filteredSystemRows = systemRows.filter((f) => scope === "all" || f.entityType === scope);
  const filteredCustomRows = rows.filter((f) => scope === "all" || f.entityType === scope);

  return (
    <div style={{ maxWidth: 1100 }}>
      <h1 style={{ margin: "4px 0 10px", fontSize: 20 }}>שדות מותאמים</h1>
      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 16,
          marginBottom: 14,
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
        >
          <label style={{ fontWeight: 700 }}>סוג שדה ליצירה/עריכה:</label>
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value as EntityType)}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
            }}
          >
            <option value="contact">Contact</option>
            <option value="opportunity">Opportunity</option>
          </select>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={() => void normalizeFieldIds()}
            disabled={normalizingIds}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "#fff",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            {normalizingIds ? "מסדר מזהים..." : "סידור מזהים אוטומטי"}
          </button>
        </div>

        <div
          style={{
            marginTop: 12,
            display: "grid",
            gap: 8,
            gridTemplateColumns: "1.3fr 1fr 1fr",
          }}
        >
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="שם שדה (label)"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
            }}
          />
          <input
            value={fieldId}
            onChange={(e) => setFieldId(e.target.value)}
            placeholder="fieldId (אופציונלי, ייווצר אוטומטית)"
            disabled={Boolean(editingFieldId)}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
            }}
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as FieldType)}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
            }}
          >
            <option value="text">text</option>
            <option value="number">number</option>
            <option value="date">date</option>
            <option value="select">select</option>
            <option value="boolean">boolean</option>
            <option value="phone">phone</option>
            <option value="email">email</option>
          </select>
        </div>

        {type === "select" && (
          <input
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            placeholder="אפשרויות (מופרדות בפסיקים)"
            style={{
              marginTop: 8,
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
            }}
          />
        )}

        <div style={{ marginTop: 10, display: "flex", gap: 14 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
            />
            <span>Required</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span>Active</span>
          </label>
        </div>

        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => void saveField()}
            disabled={saving}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "none",
              background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {saving ? "שומר..." : editingFieldId ? "שמור שינויים" : "צור שדה"}
          </button>
          {editingFieldId && (
            <button
              type="button"
              onClick={resetForm}
              style={{
                marginInlineStart: 8,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ביטול עריכה
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          overflow: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 12, borderBottom: "1px solid #f3f4f6" }}>
          <span style={{ fontWeight: 800 }}>תיקיות:</span>
          {([
            { id: "all", label: "כל השדות" },
            { id: "contact", label: "תיקיית אנשי קשר" },
            { id: "opportunity", label: "תיקיית הזדמנויות" },
          ] as Array<{ id: FieldScope; label: string }>).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setScope(f.id)}
              style={{
                border: "1px solid #e5e7eb",
                background: scope === f.id ? "#ede9fe" : "#fff",
                borderRadius: 999,
                padding: "6px 10px",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              {f.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <span style={{ color: "#6b7280", fontSize: 12 }}>
            {filteredSystemRows.length + filteredCustomRows.length} שדות
          </span>
        </div>
        {err && (
          <div
            style={{
              padding: 12,
              background: "#fef2f2",
              color: "#b91c1c",
              borderBottom: "1px solid #fecaca",
            }}
          >
            {err}
          </div>
        )}
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead>
            <tr>
              {["source", "entity", "label", "fieldId", "type", "required", "active", "options", "actions"].map(
                (h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "right",
                      padding: "10px 12px",
                      borderBottom: "2px solid #e5e7eb",
                      background: "#f8fafc",
                      fontSize: 12,
                      fontWeight: 900,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {filteredSystemRows.map((f) => (
              <tr key={`sys-${f.entityType}-${f.fieldId}`}>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>system</td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>{f.entityType}</td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>{f.label}</td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}><code>{f.fieldId}</code></td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>{f.type}</td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>{f.isRequired ? "yes" : "no"}</td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>{f.isActive ? "yes" : "no"}</td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>{(f.options ?? []).join(", ") || "—"}</td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", color: "#6b7280" }}>מנוהל מערכת</td>
              </tr>
            ))}
            {filteredCustomRows.map((f) => (
              <tr key={f.id}>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>custom</td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>{f.entityType}</td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                  {f.label}
                </td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                  <code>{f.fieldId}</code>
                </td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                  {f.type}
                </td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                  {f.isRequired ? "yes" : "no"}
                </td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                  {f.isActive ? "yes" : "no"}
                </td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                  {(f.options ?? []).join(", ")}
                </td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                  <button
                    type="button"
                    onClick={() => startEditField(f)}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      padding: "6px 8px",
                      background: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    עריכה
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeField(f.fieldId)}
                    disabled={deletingFieldId === f.fieldId}
                    style={{
                      border: "1px solid #fecaca",
                      color: "#b91c1c",
                      borderRadius: 8,
                      padding: "6px 8px",
                      background: "#fff",
                      cursor: "pointer",
                      marginInlineStart: 8,
                    }}
                  >
                    {deletingFieldId === f.fieldId ? "מוחק..." : "מחיקה"}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && filteredSystemRows.length + filteredCustomRows.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  style={{
                    padding: 16,
                    color: "#6b7280",
                    fontWeight: 700,
                  }}
                >
                  אין שדות להצגה.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


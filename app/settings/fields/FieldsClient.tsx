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

export default function FieldsClient() {
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

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/custom-fields?entityType=${encodeURIComponent(entityType)}`,
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
  }, [entityType]);

  async function createField() {
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
        setErr(j.error ?? "יצירת שדה נכשלה");
        return;
      }
      setLabel("");
      setFieldId("");
      setType("text");
      setOptionsText("");
      setIsRequired(false);
      setIsActive(true);
      await load();
    } catch {
      setErr("יצירת שדה נכשלה");
    } finally {
      setSaving(false);
    }
  }

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
          <label style={{ fontWeight: 700 }}>Entity:</label>
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
            onClick={() => void createField()}
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
            {saving ? "שומר..." : "צור שדה"}
          </button>
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
              {["Label", "fieldId", "type", "required", "active", "options"].map(
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
            {rows.map((f) => (
              <tr key={f.id}>
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
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: 16,
                    color: "#6b7280",
                    fontWeight: 700,
                  }}
                >
                  אין שדות מותאמים כרגע.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

export type CustomFieldEntity = "contact" | "opportunity";
export type CustomFieldType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "boolean"
  | "phone"
  | "email";

export type CustomFieldRecord = {
  id: string;
  fieldId: string;
  entityType: CustomFieldEntity;
  label: string;
  type: CustomFieldType;
  options?: string[];
  isRequired: boolean;
  isActive: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type UpsertCustomFieldInput = {
  fieldId?: string;
  entityType: CustomFieldEntity;
  label: string;
  type: CustomFieldType;
  options?: string[];
  isRequired?: boolean;
  isActive?: boolean;
};

function mapTs(ts: unknown): Date | null {
  if (ts && typeof ts === "object" && "toDate" in ts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (ts as any).toDate?.() ?? null;
  }
  return null;
}

function normalizeFieldId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function normalizeOptions(options?: string[]): string[] | undefined {
  if (!options?.length) return undefined;
  const out = options.map((s) => s.trim()).filter(Boolean);
  return out.length ? Array.from(new Set(out)) : undefined;
}

export async function listCustomFields(entityType?: CustomFieldEntity): Promise<CustomFieldRecord[]> {
  const db = getAdminDb();
  const col = db.collection("customFields");
  const snap = entityType
    ? await col.where("entityType", "==", entityType).get()
    : await col.get();

  const rows = snap.docs.map((doc) => {
    const d = (doc.data() ?? {}) as Record<string, unknown>;
    return {
      id: doc.id,
      fieldId: String(d.fieldId ?? doc.id),
      entityType: (d.entityType as CustomFieldEntity) ?? "contact",
      label: String(d.label ?? ""),
      type: (d.type as CustomFieldType) ?? "text",
      options: Array.isArray(d.options) ? (d.options as string[]) : undefined,
      isRequired: Boolean(d.isRequired),
      isActive: d.isActive !== false,
      createdAt: mapTs(d.createdAt),
      updatedAt: mapTs(d.updatedAt),
    } satisfies CustomFieldRecord;
  });

  return rows.sort((a, b) => a.label.localeCompare(b.label, "he"));
}

export async function upsertCustomField(input: UpsertCustomFieldInput): Promise<CustomFieldRecord> {
  const db = getAdminDb();
  const label = input.label.trim();
  if (!label) throw new Error("label is required");
  const fieldId = normalizeFieldId(input.fieldId?.trim() || label);
  if (!fieldId) throw new Error("Invalid fieldId");

  const now = FieldValue.serverTimestamp();
  const docRef = db.collection("customFields").doc(fieldId);
  const existing = await docRef.get();
  const options = normalizeOptions(input.options);

  const payload = {
    fieldId,
    entityType: input.entityType,
    label,
    type: input.type,
    options: options ?? null,
    isRequired: Boolean(input.isRequired),
    isActive: input.isActive !== false,
    updatedAt: now,
    ...(existing.exists ? {} : { createdAt: now }),
  };

  await docRef.set(payload, { merge: true });
  const snap = await docRef.get();
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  return {
    id: snap.id,
    fieldId: String(d.fieldId ?? fieldId),
    entityType: (d.entityType as CustomFieldEntity) ?? input.entityType,
    label: String(d.label ?? label),
    type: (d.type as CustomFieldType) ?? input.type,
    options: Array.isArray(d.options) ? (d.options as string[]) : undefined,
    isRequired: Boolean(d.isRequired),
    isActive: d.isActive !== false,
    createdAt: mapTs(d.createdAt),
    updatedAt: mapTs(d.updatedAt),
  };
}

export async function validateCustomValues(
  entityType: CustomFieldEntity,
  values: Record<string, unknown> | undefined
): Promise<Record<string, unknown>> {
  if (!values || typeof values !== "object") return {};
  const fields = await listCustomFields(entityType);
  const activeMap = new Map(fields.filter((f) => f.isActive).map((f) => [f.fieldId, f]));
  const out: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(values)) {
    const meta = activeMap.get(k);
    if (!meta) continue;

    if (meta.type === "number") {
      const n = typeof v === "number" ? v : Number.parseFloat(String(v));
      if (!Number.isNaN(n)) out[k] = n;
      continue;
    }
    if (meta.type === "boolean") {
      if (typeof v === "boolean") out[k] = v;
      else out[k] = String(v).trim().toLowerCase() === "true";
      continue;
    }
    out[k] = String(v ?? "");
  }

  return out;
}


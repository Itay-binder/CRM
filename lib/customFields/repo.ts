import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

export type CustomFieldEntity = "contact" | "opportunity" | "moving_order";
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
  /** ריק = חל על כל הפייפליינים; אחרת רק כשהישות (ליד/הזדמנות) שייכת לאחד מהמזהים */
  pipelineIds?: string[];
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
  pipelineIds?: string[];
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

function ensureEntityPrefixedFieldId(entityType: CustomFieldEntity, raw: string): string {
  const normalized = normalizeFieldId(raw);
  const base = normalized.replace(/^(contact|opportunity|opportiunity|moving_order)_+/g, "");
  if (!base) return "";
  return `${entityType}_${base}`;
}

function normalizeOptions(options?: string[]): string[] | undefined {
  if (!options?.length) return undefined;
  const out = options.map((s) => s.trim()).filter(Boolean);
  return out.length ? Array.from(new Set(out)) : undefined;
}

function readPipelineIds(d: Record<string, unknown>): string[] {
  if (!Array.isArray(d.pipelineIds)) return [];
  return Array.from(
    new Set((d.pipelineIds as unknown[]).map((x) => String(x).trim()).filter(Boolean))
  );
}

/** רשימה ריקה = כל הפייפליינים */
export function customFieldAppliesToPipeline(
  f: CustomFieldRecord,
  entityPipelineId: string | null | undefined
): boolean {
  const restrict = f.pipelineIds && f.pipelineIds.length > 0;
  if (!restrict) return true;
  const p = entityPipelineId?.trim();
  if (!p) return false;
  return (f.pipelineIds ?? []).includes(p);
}

export type ListCustomFieldsOptions = {
  /** כש-true — מצמצם לשדות גלובליים + שדות שמוגדרים לפייפליין הזה */
  filterByPipeline?: boolean;
  pipelineId?: string | null;
};

export async function listCustomFields(
  entityType?: CustomFieldEntity,
  options?: ListCustomFieldsOptions
): Promise<CustomFieldRecord[]> {
  const db = await getAdminDb();
  const col = db.collection("customFields");
  const snap = entityType
    ? await col.where("entityType", "==", entityType).get()
    : await col.get();

  let rows = snap.docs.map((doc) => {
    const d = (doc.data() ?? {}) as Record<string, unknown>;
    return {
      id: doc.id,
      fieldId: String(d.fieldId ?? doc.id),
      entityType: (d.entityType as CustomFieldEntity) ?? "contact",
      label: String(d.label ?? ""),
      type: (d.type as CustomFieldType) ?? "text",
      options: Array.isArray(d.options) ? (d.options as string[]) : undefined,
      pipelineIds: readPipelineIds(d),
      isRequired: Boolean(d.isRequired),
      isActive: d.isActive !== false,
      createdAt: mapTs(d.createdAt),
      updatedAt: mapTs(d.updatedAt),
    } satisfies CustomFieldRecord;
  });

  if (options?.filterByPipeline) {
    rows = rows.filter((r) => customFieldAppliesToPipeline(r, options.pipelineId ?? null));
  }

  return rows.sort((a, b) => a.label.localeCompare(b.label, "he"));
}

export async function upsertCustomField(input: UpsertCustomFieldInput): Promise<CustomFieldRecord> {
  const db = await getAdminDb();
  const label = input.label.trim();
  if (!label) throw new Error("label is required");
  const fieldId = ensureEntityPrefixedFieldId(
    input.entityType,
    input.fieldId?.trim() || label
  );
  if (!fieldId) throw new Error("Invalid fieldId");

  const now = FieldValue.serverTimestamp();
  const docRef = db.collection("customFields").doc(fieldId);
  const existing = await docRef.get();
  const options = normalizeOptions(input.options);
  const pipelineIds = Array.from(
    new Set((input.pipelineIds ?? []).map((x) => String(x).trim()).filter(Boolean))
  );

  const payload = {
    fieldId,
    entityType: input.entityType,
    label,
    type: input.type,
    options: options ?? null,
    pipelineIds,
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
    pipelineIds: readPipelineIds(d),
    isRequired: Boolean(d.isRequired),
    isActive: d.isActive !== false,
    createdAt: mapTs(d.createdAt),
    updatedAt: mapTs(d.updatedAt),
  };
}

export async function deleteCustomField(fieldId: string): Promise<void> {
  const id = normalizeFieldId(fieldId);
  if (!id) throw new Error("Invalid fieldId");
  const db = await getAdminDb();
  await db.collection("customFields").doc(id).delete();
}

export type ValidateCustomValuesOptions = {
  pipelineId?: string | null;
  previousValues?: Record<string, unknown>;
};

export async function validateCustomValues(
  entityType: CustomFieldEntity,
  values: Record<string, unknown> | undefined,
  opts?: ValidateCustomValuesOptions
): Promise<Record<string, unknown>> {
  const incoming = values && typeof values === "object" ? values : {};
  const fields = await listCustomFields();
  const activeMap = new Map(
    fields.filter((f) => f.isActive && f.entityType === entityType).map((f) => [f.fieldId, f])
  );
  const pipelineId = opts?.pipelineId ?? null;
  const previousValues = opts?.previousValues;
  const out: Record<string, unknown> = {};

  for (const [k, prevVal] of Object.entries(previousValues ?? {})) {
    const meta = activeMap.get(k);
    if (!meta) continue;
    if (!customFieldAppliesToPipeline(meta, pipelineId)) {
      out[k] = prevVal;
    }
  }

  for (const [k, v] of Object.entries(incoming)) {
    const meta = activeMap.get(k);
    if (!meta) continue;
    if (!customFieldAppliesToPipeline(meta, pipelineId)) {
      continue;
    }

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


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

function ensureEntityPrefixedFieldId(entityType: CustomFieldEntity, raw: string): string {
  const normalized = normalizeFieldId(raw);
  const base = normalized.replace(/^(contact|opportunity|opportiunity)_+/g, "");
  if (!base) return "";
  return `${entityType}_${base}`;
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
  const fieldId = ensureEntityPrefixedFieldId(
    input.entityType,
    input.fieldId?.trim() || label
  );
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

export async function deleteCustomField(fieldId: string): Promise<void> {
  const id = normalizeFieldId(fieldId);
  if (!id) throw new Error("Invalid fieldId");
  await getAdminDb().collection("customFields").doc(id).delete();
}

export async function normalizeExistingCustomFieldIds(): Promise<{
  updatedFields: number;
  touchedContacts: number;
  touchedOpportunities: number;
}> {
  const db = getAdminDb();
  const fields = await listCustomFields();
  const contactMap = new Map<string, string>();
  const opportunityMap = new Map<string, string>();
  let updatedFields = 0;

  for (const f of fields) {
    const normalizedBase = normalizeFieldId(f.fieldId || f.label).replace(
      /^(contact|opportunity|opportiunity)_+/g,
      ""
    );
    const desired = ensureEntityPrefixedFieldId(f.entityType, normalizedBase);
    if (!desired || desired === f.fieldId) continue;

    const srcRef = db.collection("customFields").doc(f.fieldId);
    const dstRef = db.collection("customFields").doc(desired);
    const srcSnap = await srcRef.get();
    if (!srcSnap.exists) continue;
    const srcData = (srcSnap.data() ?? {}) as Record<string, unknown>;
    await dstRef.set(
      {
        ...srcData,
        fieldId: desired,
        entityType: f.entityType,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await srcRef.delete();
    if (f.entityType === "contact") contactMap.set(f.fieldId, desired);
    else opportunityMap.set(f.fieldId, desired);
    updatedFields++;
  }

  let touchedContacts = 0;
  if (contactMap.size > 0) {
    const snap = await db.collection("leads").get();
    for (const doc of snap.docs) {
      const d = (doc.data() ?? {}) as Record<string, unknown>;
      const cf =
        typeof d.customFields === "object" && d.customFields
          ? { ...(d.customFields as Record<string, unknown>) }
          : null;
      if (!cf) continue;
      let changed = false;
      for (const [oldId, newId] of contactMap.entries()) {
        if (oldId in cf) {
          cf[newId] = cf[oldId];
          delete cf[oldId];
          changed = true;
        }
      }
      if (!changed) continue;
      await doc.ref.set(
        { customFields: cf, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
      touchedContacts++;
    }
  }

  let touchedOpportunities = 0;
  if (opportunityMap.size > 0) {
    const snap = await db.collection("opportunities").get();
    for (const doc of snap.docs) {
      const d = (doc.data() ?? {}) as Record<string, unknown>;
      const cv =
        typeof d.customValues === "object" && d.customValues
          ? { ...(d.customValues as Record<string, unknown>) }
          : null;
      if (!cv) continue;
      let changed = false;
      for (const [oldId, newId] of opportunityMap.entries()) {
        if (oldId in cv) {
          cv[newId] = cv[oldId];
          delete cv[oldId];
          changed = true;
        }
      }
      if (!changed) continue;
      await doc.ref.set(
        { customValues: cv, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
      touchedOpportunities++;
    }
  }

  return { updatedFields, touchedContacts, touchedOpportunities };
}

export async function validateCustomValues(
  _entityType: CustomFieldEntity,
  values: Record<string, unknown> | undefined
): Promise<Record<string, unknown>> {
  if (!values || typeof values !== "object") return {};
  // Custom fields are shared for integrations across contacts/opportunities.
  // Accept any active configured fieldId regardless of specific entity type.
  const fields = await listCustomFields();
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


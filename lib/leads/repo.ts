import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

export type LeadRecord = {
  id: string; // doc id = normalized unique key
  email?: string;
  phone?: string;
  name?: string;
  stage: string;
  pipelineId?: string;
  source?: string;
  utm?: Record<string, string>;
  customFields?: Record<string, unknown>;
  assignedRep?: string;
  notes?: Array<{ id: string; text: string; createdAt: string }>;
  tasks?: Array<{ id: string; title: string; dueAt: string; done: boolean; createdAt: string }>;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type LeadUpsertInput = {
  id?: string;
  uniqueKey?: string;
  email?: string;
  phone?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  stage?: string;
  pipelineId?: string;
  source?: string;
  utm?: Record<string, string>;
  customFields?: Record<string, unknown>;
  assignedRep?: string;
  /**
   * Optional: when importing historical data from integrations.
   * Accepts ISO date/time.
   */
  createdAt?: string;
};

function normalizeUniqueKey(raw: string): string {
  return raw.trim().toLowerCase();
}

function normalizePhone(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const digits = raw.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (!digits) return undefined;

  // Already in IL international prefix format.
  if (digits.startsWith("972")) return digits;

  // Local Israeli numbers (mobile/landline) like 052..., 03..., 072...
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;

  // Fallback: keep numeric value as-is if not recognizable IL local format.
  return digits.replace(/[^\d]/g, "");
}

function pickUniqueKey(input: LeadUpsertInput): { docId: string; email?: string; phone?: string } | null {
  if (input.uniqueKey && input.uniqueKey.trim()) {
    const docId = normalizeUniqueKey(input.uniqueKey);
    return { docId, email: input.email, phone: normalizePhone(input.phone) };
  }

  if (input.email && input.email.trim()) {
    const email = input.email.trim().toLowerCase();
    return { docId: normalizeUniqueKey(email), email };
  }

  if (input.phone && input.phone.trim()) {
    // Store phones in normalized format to keep deduplication stable.
    const phone = normalizePhone(input.phone);
    if (!phone) return null;
    return { docId: normalizeUniqueKey(phone), phone };
  }

  return null;
}

function toName(input: LeadUpsertInput): string | undefined {
  if (input.name && input.name.trim()) return input.name.trim();
  const fn = input.firstName?.trim();
  const ln = input.lastName?.trim();
  if (fn || ln) return [fn, ln].filter(Boolean).join(" ");
  return undefined;
}

function maybeParseDate(input?: string): Date | null {
  if (!input?.trim()) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function mapDocToLead(docId: string, data: Record<string, unknown>): LeadRecord {
  const createdAtTs = data.createdAt;
  const updatedAtTs = data.updatedAt;

  const createdAt =
    createdAtTs && typeof createdAtTs === "object" && "toDate" in createdAtTs
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (createdAtTs as any).toDate?.() ?? null
      : null;

  const updatedAt =
    updatedAtTs && typeof updatedAtTs === "object" && "toDate" in updatedAtTs
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (updatedAtTs as any).toDate?.() ?? null
      : null;

  return {
    id: docId,
    email: typeof data.email === "string" ? data.email : undefined,
    phone: typeof data.phone === "string" ? data.phone : undefined,
    name: typeof data.name === "string" ? data.name : undefined,
    stage: typeof data.stage === "string" && data.stage.trim() ? data.stage : "Pending",
    pipelineId: typeof data.pipelineId === "string" ? data.pipelineId : undefined,
    source: typeof data.source === "string" ? data.source : undefined,
    utm: typeof data.utm === "object" ? (data.utm as Record<string, string>) : undefined,
    customFields:
      typeof data.customFields === "object" ? (data.customFields as Record<string, unknown>) : undefined,
    assignedRep: typeof data.assignedRep === "string" ? data.assignedRep : undefined,
    notes: Array.isArray(data.notes)
      ? (data.notes as Array<{ id: string; text: string; createdAt: string }>)
      : undefined,
    tasks: Array.isArray(data.tasks)
      ? (data.tasks as Array<{ id: string; title: string; dueAt: string; done: boolean; createdAt: string }>)
      : undefined,
    createdAt,
    updatedAt,
  };
}

export async function upsertLead(input: LeadUpsertInput): Promise<LeadRecord> {
  const db = getAdminDb();
  const picked =
    input.id?.trim()
      ? { docId: normalizeUniqueKey(input.id), email: input.email, phone: input.phone }
      : pickUniqueKey(input);
  if (!picked) throw new Error("Missing uniqueKey (email or phone)");

  const stage = (input.stage?.trim() || "Pending").replace(/\s+/g, " ");
  const pipelineId = input.pipelineId?.trim() || undefined;
  const name = toName(input);

  const docRef = db.collection("leads").doc(picked.docId);

  const createdAtDate = maybeParseDate(input.createdAt);

  const snap = await docRef.get();
  const nowUpdate = FieldValue.serverTimestamp();

  if (!snap.exists) {
    const payload: Record<string, unknown> = {
      stage,
      createdAt: createdAtDate ? createdAtDate : nowUpdate,
      updatedAt: nowUpdate,
    };
    if (picked.email) payload.email = picked.email;
    if (picked.phone) payload.phone = picked.phone;
    if (name) payload.name = name;
    if (pipelineId) payload.pipelineId = pipelineId;
    const source = input.source?.trim();
    if (source) payload.source = source;
    if (input.utm) payload.utm = input.utm;
    if (input.customFields) payload.customFields = input.customFields;
    if (input.assignedRep?.trim()) payload.assignedRep = input.assignedRep.trim();
    await docRef.set(payload);
  } else {
    const prev = (snap.data() ?? {}) as Record<string, unknown>;
    const payload: Record<string, unknown> = {
      stage,
      updatedAt: nowUpdate,
    };
    if (picked.email ?? prev.email) payload.email = picked.email ?? prev.email;
    if (picked.phone ?? prev.phone) payload.phone = picked.phone ?? prev.phone;
    if (name ?? prev.name) payload.name = name ?? prev.name;
    if (pipelineId) payload.pipelineId = pipelineId;
    const source = input.source?.trim() || (prev.source as string | undefined);
    if (source) payload.source = source;
    if (input.utm ?? prev.utm) payload.utm = input.utm ?? prev.utm;
    if (input.customFields ?? prev.customFields) payload.customFields = input.customFields ?? prev.customFields;
    const assignedRep = input.assignedRep?.trim() || (prev.assignedRep as string | undefined);
    if (assignedRep) payload.assignedRep = assignedRep;
    await docRef.set(payload, { merge: true });
  }

  const again = await docRef.get();
  const data = (again.data() ?? {}) as Record<string, unknown>;
  return mapDocToLead(again.id, data);
}

function dateToYmd(d: Date): string {
  // Return UTC ymd for stable lexicographic compare.
  return d.toISOString().slice(0, 10);
}

function parseYmdBoundary(dateStr: string, mode: "from" | "to"): Date {
  // dateStr is YYYY-MM-DD
  const [y, m, d] = dateStr.split("-").map((x) => Number.parseInt(x, 10));
  if (!y || !m || !d) return new Date(0);
  if (mode === "from") return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
}

export async function listLeadsFiltered(dateFrom?: string | null, dateTo?: string | null): Promise<LeadRecord[]> {
  const db = getAdminDb();
  const snap = await db.collection("leads").get();
  const leads = snap.docs.map((d) => mapDocToLead(d.id, d.data() as Record<string, unknown>));

  const from = dateFrom?.trim();
  const to = dateTo?.trim();
  if (!from && !to) return leads;

  const fromDate = from ? parseYmdBoundary(from, "from") : null;
  const toDate = to ? parseYmdBoundary(to, "to") : null;

  return leads.filter((l) => {
    if (!l.createdAt) return false;
    const t = l.createdAt.getTime();
    if (fromDate && t < fromDate.getTime()) return false;
    if (toDate && t > toDate.getTime()) return false;
    return true;
  });
}

export async function getLeadById(id: string): Promise<LeadRecord | null> {
  const docId = normalizeUniqueKey(id);
  const snap = await getAdminDb().collection("leads").doc(docId).get();
  if (!snap.exists) return null;
  return mapDocToLead(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
}

export async function updateLead(
  id: string,
  input: {
    name?: string;
    email?: string;
    phone?: string;
    stage?: string;
    assignedRep?: string;
    customFields?: Record<string, unknown>;
    notes?: Array<{ id: string; text: string; createdAt: string }>;
    tasks?: Array<{ id: string; title: string; dueAt: string; done: boolean; createdAt: string }>;
  }
): Promise<LeadRecord> {
  const docId = normalizeUniqueKey(id);
  const ref = getAdminDb().collection("leads").doc(docId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Contact not found");

  const payload: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (input.name !== undefined) payload.name = input.name.trim();
  if (input.email !== undefined) payload.email = input.email.trim().toLowerCase();
  if (input.phone !== undefined) payload.phone = normalizePhone(input.phone) ?? "";
  if (input.stage !== undefined) payload.stage = input.stage.trim() || "Pending";
  if (input.assignedRep !== undefined) payload.assignedRep = input.assignedRep.trim();
  if (input.customFields !== undefined) payload.customFields = input.customFields;
  if (input.notes !== undefined) payload.notes = input.notes;
  if (input.tasks !== undefined) payload.tasks = input.tasks;
  await ref.set(payload, { merge: true });

  const again = await ref.get();
  return mapDocToLead(again.id, (again.data() ?? {}) as Record<string, unknown>);
}


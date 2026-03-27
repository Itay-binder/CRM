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
  /**
   * Optional: when importing historical data from integrations.
   * Accepts ISO date/time.
   */
  createdAt?: string;
};

function normalizeUniqueKey(raw: string): string {
  return raw.trim().toLowerCase();
}

function pickUniqueKey(input: LeadUpsertInput): { docId: string; email?: string; phone?: string } | null {
  if (input.uniqueKey && input.uniqueKey.trim()) {
    const docId = normalizeUniqueKey(input.uniqueKey);
    return { docId, email: input.email, phone: input.phone };
  }

  if (input.email && input.email.trim()) {
    const email = input.email.trim().toLowerCase();
    return { docId: normalizeUniqueKey(email), email };
  }

  if (input.phone && input.phone.trim()) {
    // Keep original formatting in stored phone, but doc id normalized.
    const phone = input.phone.trim();
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
    await docRef.set({
      email: picked.email,
      phone: picked.phone,
      name,
      stage,
      pipelineId,
      source: input.source?.trim() || undefined,
      utm: input.utm ?? undefined,
      customFields: input.customFields ?? undefined,
      createdAt: createdAtDate ? createdAtDate : nowUpdate,
      updatedAt: nowUpdate,
    });
  } else {
    await docRef.set(
      {
        email: picked.email ?? snap.data()?.email,
        phone: picked.phone ?? snap.data()?.phone,
        name: name ?? snap.data()?.name,
        stage,
        pipelineId,
        source: input.source?.trim() || (snap.data()?.source as string | undefined),
        utm: input.utm ?? (snap.data()?.utm as Record<string, string> | undefined),
        customFields: input.customFields ?? (snap.data()?.customFields as Record<string, unknown> | undefined),
        updatedAt: nowUpdate,
      },
      { merge: true }
    );
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


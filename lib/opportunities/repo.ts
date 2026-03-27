import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

export type PipelineRecord = {
  id: string;
  name: string;
  stages: string[];
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type OpportunityRecord = {
  id: string;
  name: string;
  contactId: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  pipelineId: string;
  stage: string;
  value?: number;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type CreatePipelineInput = {
  name: string;
  stages: string[];
};

export type CreateOpportunityInput = {
  name?: string;
  contactId: string;
  pipelineId: string;
  stage?: string;
  value?: number;
};

function mapTs(ts: unknown): Date | null {
  if (ts && typeof ts === "object" && "toDate" in ts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (ts as any).toDate?.() ?? null;
  }
  return null;
}

function normalizeStages(stages: string[]): string[] {
  const out = stages
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  return Array.from(new Set(out));
}

export async function ensureDefaultPipeline(): Promise<PipelineRecord> {
  const db = getAdminDb();
  const ref = db.collection("pipelines").doc("default-sales");
  const snap = await ref.get();
  if (!snap.exists) {
    const now = FieldValue.serverTimestamp();
    await ref.set({
      name: "מוקד מכירות",
      stages: ["Pending", "Contacted", "Proposal Sent", "Closed"],
      createdAt: now,
      updatedAt: now,
    });
  }
  const again = await ref.get();
  const d = (again.data() ?? {}) as Record<string, unknown>;
  return {
    id: again.id,
    name: String(d.name ?? "מוקד מכירות"),
    stages: normalizeStages((d.stages as string[] | undefined) ?? ["Pending", "Contacted", "Proposal Sent", "Closed"]),
    createdAt: mapTs(d.createdAt),
    updatedAt: mapTs(d.updatedAt),
  };
}

export async function listPipelines(): Promise<PipelineRecord[]> {
  await ensureDefaultPipeline();
  const db = getAdminDb();
  const snap = await db.collection("pipelines").get();
  const rows = snap.docs.map((doc) => {
    const d = (doc.data() ?? {}) as Record<string, unknown>;
    return {
      id: doc.id,
      name: String(d.name ?? ""),
      stages: normalizeStages((d.stages as string[] | undefined) ?? []),
      createdAt: mapTs(d.createdAt),
      updatedAt: mapTs(d.updatedAt),
    } satisfies PipelineRecord;
  });
  return rows.sort((a, b) => a.name.localeCompare(b.name, "he"));
}

export async function createPipeline(input: CreatePipelineInput): Promise<PipelineRecord> {
  const db = getAdminDb();
  const name = input.name.trim();
  if (!name) throw new Error("Pipeline name is required");
  const stages = normalizeStages(input.stages);
  if (stages.length === 0) throw new Error("At least one stage is required");

  const now = FieldValue.serverTimestamp();
  const ref = await db.collection("pipelines").add({
    name,
    stages,
    createdAt: now,
    updatedAt: now,
  });
  const snap = await ref.get();
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  return {
    id: snap.id,
    name: String(d.name ?? name),
    stages: normalizeStages((d.stages as string[] | undefined) ?? stages),
    createdAt: mapTs(d.createdAt),
    updatedAt: mapTs(d.updatedAt),
  };
}

export async function listOpportunities(pipelineId?: string | null): Promise<OpportunityRecord[]> {
  await ensureDefaultPipeline();
  const db = getAdminDb();
  let snap;
  if (pipelineId?.trim()) {
    snap = await db.collection("opportunities").where("pipelineId", "==", pipelineId.trim()).get();
  } else {
    snap = await db.collection("opportunities").get();
  }

  const out = snap.docs.map((doc) => {
    const d = (doc.data() ?? {}) as Record<string, unknown>;
    return {
      id: doc.id,
      name: String(d.name ?? ""),
      contactId: String(d.contactId ?? ""),
      contactName: typeof d.contactName === "string" ? d.contactName : undefined,
      contactEmail: typeof d.contactEmail === "string" ? d.contactEmail : undefined,
      contactPhone: typeof d.contactPhone === "string" ? d.contactPhone : undefined,
      pipelineId: String(d.pipelineId ?? ""),
      stage: String(d.stage ?? "Pending"),
      value: typeof d.value === "number" ? d.value : undefined,
      createdAt: mapTs(d.createdAt),
      updatedAt: mapTs(d.updatedAt),
    } satisfies OpportunityRecord;
  });

  return out.sort((a, b) => {
    const at = a.createdAt?.getTime() ?? 0;
    const bt = b.createdAt?.getTime() ?? 0;
    return bt - at;
  });
}

export async function createOpportunity(input: CreateOpportunityInput): Promise<OpportunityRecord> {
  const db = getAdminDb();
  const contactId = input.contactId.trim();
  if (!contactId) throw new Error("contactId is required");

  const pipelineId = input.pipelineId?.trim() || (await ensureDefaultPipeline()).id;
  const pipelineSnap = await db.collection("pipelines").doc(pipelineId).get();
  if (!pipelineSnap.exists) throw new Error("Pipeline not found");
  const pd = (pipelineSnap.data() ?? {}) as Record<string, unknown>;
  const stages = normalizeStages((pd.stages as string[] | undefined) ?? ["Pending"]);
  const stage = input.stage?.trim() || stages[0] || "Pending";

  const contactSnap = await db.collection("leads").doc(contactId).get();
  if (!contactSnap.exists) throw new Error("Contact not found");
  const cd = (contactSnap.data() ?? {}) as Record<string, unknown>;

  const now = FieldValue.serverTimestamp();
  const ref = await db.collection("opportunities").add({
    name: input.name?.trim() || (typeof cd.name === "string" ? cd.name : "Opportunity"),
    contactId,
    contactName: typeof cd.name === "string" ? cd.name : "",
    contactEmail: typeof cd.email === "string" ? cd.email : "",
    contactPhone: typeof cd.phone === "string" ? cd.phone : "",
    pipelineId,
    stage,
    value: typeof input.value === "number" ? input.value : null,
    createdAt: now,
    updatedAt: now,
  });

  const snap = await ref.get();
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  return {
    id: snap.id,
    name: String(d.name ?? ""),
    contactId: String(d.contactId ?? contactId),
    contactName: typeof d.contactName === "string" ? d.contactName : undefined,
    contactEmail: typeof d.contactEmail === "string" ? d.contactEmail : undefined,
    contactPhone: typeof d.contactPhone === "string" ? d.contactPhone : undefined,
    pipelineId: String(d.pipelineId ?? pipelineId),
    stage: String(d.stage ?? stage),
    value: typeof d.value === "number" ? d.value : undefined,
    createdAt: mapTs(d.createdAt),
    updatedAt: mapTs(d.updatedAt),
  };
}


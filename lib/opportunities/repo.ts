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
  customValues?: Record<string, unknown>;
  assignedRep?: string;
  notes?: Array<{ id: string; text: string; createdAt: string }>;
  tasks?: Array<{ id: string; title: string; dueAt: string; done: boolean; createdAt: string }>;
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
  customValues?: Record<string, unknown>;
  assignedRep?: string;
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
      customValues:
        typeof d.customValues === "object"
          ? (d.customValues as Record<string, unknown>)
          : undefined,
      assignedRep: typeof d.assignedRep === "string" ? d.assignedRep : undefined,
      notes: Array.isArray(d.notes)
        ? (d.notes as Array<{ id: string; text: string; createdAt: string }>)
        : undefined,
      tasks: Array.isArray(d.tasks)
        ? (d.tasks as Array<{ id: string; title: string; dueAt: string; done: boolean; createdAt: string }>)
        : undefined,
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
    customValues: input.customValues ?? {},
    assignedRep:
      input.assignedRep?.trim() ||
      (typeof cd.assignedRep === "string" ? cd.assignedRep : ""),
    notes: [],
    tasks: [],
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
    customValues:
      typeof d.customValues === "object"
        ? (d.customValues as Record<string, unknown>)
        : undefined,
    assignedRep: typeof d.assignedRep === "string" ? d.assignedRep : undefined,
    notes: Array.isArray(d.notes)
      ? (d.notes as Array<{ id: string; text: string; createdAt: string }>)
      : undefined,
    tasks: Array.isArray(d.tasks)
      ? (d.tasks as Array<{ id: string; title: string; dueAt: string; done: boolean; createdAt: string }>)
      : undefined,
    createdAt: mapTs(d.createdAt),
    updatedAt: mapTs(d.updatedAt),
  };
}

export async function getOpportunityById(id: string): Promise<OpportunityRecord | null> {
  const snap = await getAdminDb().collection("opportunities").doc(id).get();
  if (!snap.exists) return null;
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  return {
    id: snap.id,
    name: String(d.name ?? ""),
    contactId: String(d.contactId ?? ""),
    contactName: typeof d.contactName === "string" ? d.contactName : undefined,
    contactEmail: typeof d.contactEmail === "string" ? d.contactEmail : undefined,
    contactPhone: typeof d.contactPhone === "string" ? d.contactPhone : undefined,
    pipelineId: String(d.pipelineId ?? ""),
    stage: String(d.stage ?? "Pending"),
    value: typeof d.value === "number" ? d.value : undefined,
    customValues:
      typeof d.customValues === "object"
        ? (d.customValues as Record<string, unknown>)
        : undefined,
    assignedRep: typeof d.assignedRep === "string" ? d.assignedRep : undefined,
    notes: Array.isArray(d.notes)
      ? (d.notes as Array<{ id: string; text: string; createdAt: string }>)
      : undefined,
    tasks: Array.isArray(d.tasks)
      ? (d.tasks as Array<{ id: string; title: string; dueAt: string; done: boolean; createdAt: string }>)
      : undefined,
    createdAt: mapTs(d.createdAt),
    updatedAt: mapTs(d.updatedAt),
  };
}

export async function updateOpportunity(
  id: string,
  input: {
    name?: string;
    pipelineId?: string;
    stage?: string;
    value?: number | null;
    assignedRep?: string;
    customValues?: Record<string, unknown>;
    notes?: Array<{ id: string; text: string; createdAt: string }>;
    tasks?: Array<{ id: string; title: string; dueAt: string; done: boolean; createdAt: string }>;
  }
): Promise<OpportunityRecord> {
  const ref = getAdminDb().collection("opportunities").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Opportunity not found");
  const payload: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (input.name !== undefined) payload.name = input.name.trim();
  if (input.pipelineId !== undefined) payload.pipelineId = input.pipelineId.trim();
  if (input.stage !== undefined) payload.stage = input.stage.trim();
  if (input.value !== undefined) payload.value = input.value;
  if (input.assignedRep !== undefined) payload.assignedRep = input.assignedRep.trim();
  if (input.customValues !== undefined) payload.customValues = input.customValues;
  if (input.notes !== undefined) payload.notes = input.notes;
  if (input.tasks !== undefined) payload.tasks = input.tasks;
  await ref.set(payload, { merge: true });
  const again = await ref.get();
  return (await getOpportunityById(again.id)) as OpportunityRecord;
}

export async function updatePipeline(
  id: string,
  input: { name?: string; stages?: string[] }
): Promise<PipelineRecord> {
  const ref = getAdminDb().collection("pipelines").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Pipeline not found");
  const payload: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (input.name !== undefined) payload.name = input.name.trim();
  if (input.stages !== undefined) payload.stages = normalizeStages(input.stages);
  await ref.set(payload, { merge: true });
  const again = await ref.get();
  const d = (again.data() ?? {}) as Record<string, unknown>;
  return {
    id: again.id,
    name: String(d.name ?? ""),
    stages: normalizeStages((d.stages as string[] | undefined) ?? []),
    createdAt: mapTs(d.createdAt),
    updatedAt: mapTs(d.updatedAt),
  };
}


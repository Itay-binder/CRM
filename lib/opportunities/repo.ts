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
  lastNoteBody?: string;
  lastNoteAt: Date | null;
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

/** Stage label that triggers win automation (note + customer pipeline opportunity). */
export const WON_STAGE_LABEL = "זכיה";

const CUSTOMERS_PIPELINE_ID = "customers";

function normalizeStageLabel(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

export async function ensureCustomersPipeline(): Promise<PipelineRecord> {
  const db = getAdminDb();
  const ref = db.collection("pipelines").doc(CUSTOMERS_PIPELINE_ID);
  const snap = await ref.get();
  if (!snap.exists) {
    const now = FieldValue.serverTimestamp();
    await ref.set({
      name: "לקוחות",
      stages: ["חדש"],
      createdAt: now,
      updatedAt: now,
    });
  }
  const again = await ref.get();
  const d = (again.data() ?? {}) as Record<string, unknown>;
  return {
    id: again.id,
    name: String(d.name ?? "לקוחות"),
    stages: normalizeStages((d.stages as string[] | undefined) ?? ["חדש"]),
    createdAt: mapTs(d.createdAt),
    updatedAt: mapTs(d.updatedAt),
  };
}

export async function ensureDefaultPipeline(): Promise<PipelineRecord> {
  const db = getAdminDb();
  const ref = db.collection("pipelines").doc("default-sales");
  const snap = await ref.get();
  if (!snap.exists) {
    const now = FieldValue.serverTimestamp();
    await ref.set({
      name: "מוקד מכירות",
      stages: ["Pending", "Contacted", "Proposal Sent", "זכיה", "Closed"],
      createdAt: now,
      updatedAt: now,
    });
  } else {
    const d0 = (snap.data() ?? {}) as Record<string, unknown>;
    const cur = normalizeStages((d0.stages as string[] | undefined) ?? []);
    if (!cur.some((s) => normalizeStageLabel(s) === WON_STAGE_LABEL)) {
      const insertAt = Math.max(0, cur.length - 1);
      const next = [...cur.slice(0, insertAt), WON_STAGE_LABEL, ...cur.slice(insertAt)];
      await ref.update({
        stages: normalizeStages(next),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }
  const again = await ref.get();
  const d = (again.data() ?? {}) as Record<string, unknown>;
  return {
    id: again.id,
    name: String(d.name ?? "מוקד מכירות"),
    stages: normalizeStages(
      (d.stages as string[] | undefined) ?? ["Pending", "Contacted", "Proposal Sent", "זכיה", "Closed"]
    ),
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
      lastNoteBody: typeof d.lastNoteBody === "string" ? d.lastNoteBody : undefined,
      lastNoteAt: mapTs(d.lastNoteAt),
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
    lastNoteBody: typeof d.lastNoteBody === "string" ? d.lastNoteBody : undefined,
    lastNoteAt: mapTs(d.lastNoteAt),
    createdAt: mapTs(d.createdAt),
    updatedAt: mapTs(d.updatedAt),
  };
}

function isWonStage(stage: string): boolean {
  return normalizeStageLabel(stage) === WON_STAGE_LABEL;
}

/**
 * Updates opportunity stage. When stage becomes "זכיה" for the first time on this doc,
 * appends a note and creates a linked opportunity on the "לקוחות" pipeline.
 */
export async function updateOpportunityStage(
  opportunityId: string,
  nextStageRaw: string
): Promise<OpportunityRecord> {
  const id = opportunityId.trim();
  if (!id) throw new Error("opportunity id is required");

  const nextStage = normalizeStageLabel(nextStageRaw);
  if (!nextStage) throw new Error("stage is required");

  const customersPipe = await ensureCustomersPipeline();
  const firstCustomerStage = normalizeStageLabel(customersPipe.stages[0] || "חדש");

  const db = getAdminDb();
  const oppRef = db.collection("opportunities").doc(id);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(oppRef);
    if (!snap.exists) throw new Error("Opportunity not found");

    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const prevStage = normalizeStageLabel(String(data.stage ?? "Pending"));
    const alreadyAutomated = data.winAutomationDone === true;

    const pipelineId = String(data.pipelineId ?? "");
    const contactId = String(data.contactId ?? "");
    if (!contactId) throw new Error("Opportunity has no contact");

    const pipelineSnap = await tx.get(db.collection("pipelines").doc(pipelineId));
    if (!pipelineSnap.exists) throw new Error("Pipeline not found");
    const pd = (pipelineSnap.data() ?? {}) as Record<string, unknown>;
    const allowed = normalizeStages((pd.stages as string[] | undefined) ?? []);
    if (!allowed.some((s) => normalizeStageLabel(s) === nextStage)) {
      throw new Error(`Stage "${nextStage}" is not in this pipeline`);
    }

    const now = FieldValue.serverTimestamp();
    const patch: Record<string, unknown> = {
      stage: nextStage,
      updatedAt: now,
    };

    const shouldAutomate =
      pipelineId !== CUSTOMERS_PIPELINE_ID &&
      isWonStage(nextStage) &&
      !isWonStage(prevStage) &&
      !alreadyAutomated;

    if (shouldAutomate) {
      const noteRef = oppRef.collection("notes").doc();
      tx.set(noteRef, {
        body: "לקוח חדש",
        createdAt: now,
        source: "win-automation",
      });

      patch.lastNoteBody = "לקוח חדש";
      patch.lastNoteAt = now;
      patch.winAutomationDone = true;

      const newOppRef = db.collection("opportunities").doc();
      const name =
        typeof data.name === "string" && data.name.trim()
          ? `${data.name.trim()} — לקוח`
          : "לקוח חדש";
      tx.set(newOppRef, {
        name,
        contactId,
        contactName: typeof data.contactName === "string" ? data.contactName : "",
        contactEmail: typeof data.contactEmail === "string" ? data.contactEmail : "",
        contactPhone: typeof data.contactPhone === "string" ? data.contactPhone : "",
        pipelineId: CUSTOMERS_PIPELINE_ID,
        stage: firstCustomerStage,
        value: null,
        sourceOpportunityId: id,
        createdAt: now,
        updatedAt: now,
      });
    }

    tx.update(oppRef, patch);
  });

  const final = await oppRef.get();
  const d = (final.data() ?? {}) as Record<string, unknown>;
  return {
    id: final.id,
    name: String(d.name ?? ""),
    contactId: String(d.contactId ?? ""),
    contactName: typeof d.contactName === "string" ? d.contactName : undefined,
    contactEmail: typeof d.contactEmail === "string" ? d.contactEmail : undefined,
    contactPhone: typeof d.contactPhone === "string" ? d.contactPhone : undefined,
    pipelineId: String(d.pipelineId ?? ""),
    stage: String(d.stage ?? nextStage),
    value: typeof d.value === "number" ? d.value : undefined,
    lastNoteBody: typeof d.lastNoteBody === "string" ? d.lastNoteBody : undefined,
    lastNoteAt: mapTs(d.lastNoteAt),
    createdAt: mapTs(d.createdAt),
    updatedAt: mapTs(d.updatedAt),
  };
}


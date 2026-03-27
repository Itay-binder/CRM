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
  email?: string;
  phone?: string;
  pipelineId: string;
  stage: string;
  status?: "פתוח" | "זכיה" | "הפסד";
  value?: number;
  utmSource?: string;
  utmCampaign?: string;
  utmMedium?: string;
  utmContent?: string;
  landingpage?: string;
  tags?: string[];
  lastLeadAt?: Date | null;
  customValues?: Record<string, unknown>;
  assignedRep?: string;
  notes?: Array<{ id: string; text: string; createdAt: string; createdBy?: string }>;
  tasks?: Array<{
    id: string;
    title: string;
    dueAt: string;
    done: boolean;
    status?: "todo" | "in_progress" | "done";
    comments?: Array<{ id: string; text: string; createdAt: string }>;
    createdAt: string;
  }>;
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
  status?: "פתוח" | "זכיה" | "הפסד";
  email?: string;
  phone?: string;
  utmSource?: string;
  utmCampaign?: string;
  utmMedium?: string;
  utmContent?: string;
  landingpage?: string;
  tags?: string[];
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
      email: typeof d.email === "string" ? d.email : undefined,
      phone: typeof d.phone === "string" ? d.phone : undefined,
      pipelineId: String(d.pipelineId ?? ""),
      stage: String(d.stage ?? "Pending"),
      status:
        d.status === "זכיה" || d.status === "הפסד" || d.status === "פתוח"
          ? d.status
          : "פתוח",
      value: typeof d.value === "number" ? d.value : undefined,
      utmSource: typeof d.utmSource === "string" ? d.utmSource : undefined,
      utmCampaign: typeof d.utmCampaign === "string" ? d.utmCampaign : undefined,
      utmMedium: typeof d.utmMedium === "string" ? d.utmMedium : undefined,
      utmContent: typeof d.utmContent === "string" ? d.utmContent : undefined,
      landingpage: typeof d.landingpage === "string" ? d.landingpage : undefined,
      tags: Array.isArray(d.tags) ? (d.tags as string[]) : undefined,
      lastLeadAt: mapTs(d.lastLeadAt),
      customValues:
        typeof d.customValues === "object"
          ? (d.customValues as Record<string, unknown>)
          : undefined,
      assignedRep: typeof d.assignedRep === "string" ? d.assignedRep : undefined,
      notes: Array.isArray(d.notes)
        ? (d.notes as Array<{ id: string; text: string; createdAt: string; createdBy?: string }>)
        : undefined,
      tasks: Array.isArray(d.tasks)
        ? (d.tasks as Array<{
            id: string;
            title: string;
            dueAt: string;
            done: boolean;
            status?: "todo" | "in_progress" | "done";
            comments?: Array<{ id: string; text: string; createdAt: string }>;
            createdAt: string;
          }>)
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
  const requestedStage = input.stage?.trim();
  const stage =
    requestedStage && stages.includes(requestedStage)
      ? requestedStage
      : stages[0] || "Pending";

  const contactSnap = await db.collection("leads").doc(contactId).get();
  if (!contactSnap.exists) throw new Error("Contact not found");
  const cd = (contactSnap.data() ?? {}) as Record<string, unknown>;

  const now = FieldValue.serverTimestamp();
  const existingSame = await db
    .collection("opportunities")
    .where("pipelineId", "==", pipelineId)
    .where("contactId", "==", contactId)
    .limit(1)
    .get();

  if (!existingSame.empty) {
    const existingRef = existingSame.docs[0].ref;
    await existingRef.set(
      {
        name: input.name?.trim() || (typeof cd.name === "string" ? cd.name : "Opportunity"),
        stage,
        status: input.status ?? "פתוח",
        value: typeof input.value === "number" ? input.value : null,
        email: input.email?.trim() || (typeof cd.email === "string" ? cd.email : ""),
        phone: input.phone?.trim() || (typeof cd.phone === "string" ? cd.phone : ""),
        utmSource: input.utmSource?.trim() || "",
        utmCampaign: input.utmCampaign?.trim() || "",
        utmMedium: input.utmMedium?.trim() || "",
        utmContent: input.utmContent?.trim() || "",
        landingpage: input.landingpage?.trim() || "",
        tags: input.tags ?? [],
        customValues: input.customValues ?? {},
        assignedRep:
          input.assignedRep?.trim() ||
          (typeof cd.assignedRep === "string" ? cd.assignedRep : ""),
        lastLeadAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
    const updated = await existingRef.get();
    const d = (updated.data() ?? {}) as Record<string, unknown>;
    return {
      id: updated.id,
      name: String(d.name ?? ""),
      contactId: String(d.contactId ?? contactId),
      contactName: typeof d.contactName === "string" ? d.contactName : undefined,
      contactEmail: typeof d.contactEmail === "string" ? d.contactEmail : undefined,
      contactPhone: typeof d.contactPhone === "string" ? d.contactPhone : undefined,
      email: typeof d.email === "string" ? d.email : undefined,
      phone: typeof d.phone === "string" ? d.phone : undefined,
      pipelineId: String(d.pipelineId ?? pipelineId),
      stage: String(d.stage ?? stage),
      status:
        d.status === "זכיה" || d.status === "הפסד" || d.status === "פתוח"
          ? d.status
          : "פתוח",
      value: typeof d.value === "number" ? d.value : undefined,
      utmSource: typeof d.utmSource === "string" ? d.utmSource : undefined,
      utmCampaign: typeof d.utmCampaign === "string" ? d.utmCampaign : undefined,
      utmMedium: typeof d.utmMedium === "string" ? d.utmMedium : undefined,
      utmContent: typeof d.utmContent === "string" ? d.utmContent : undefined,
      landingpage: typeof d.landingpage === "string" ? d.landingpage : undefined,
      tags: Array.isArray(d.tags) ? (d.tags as string[]) : undefined,
      lastLeadAt: mapTs(d.lastLeadAt),
      customValues:
        typeof d.customValues === "object"
          ? (d.customValues as Record<string, unknown>)
          : undefined,
      assignedRep: typeof d.assignedRep === "string" ? d.assignedRep : undefined,
      notes: Array.isArray(d.notes)
        ? (d.notes as Array<{ id: string; text: string; createdAt: string }>)
        : undefined,
      tasks: Array.isArray(d.tasks)
        ? (d.tasks as Array<{
            id: string;
            title: string;
            dueAt: string;
            done: boolean;
            status?: "todo" | "in_progress" | "done";
            comments?: Array<{ id: string; text: string; createdAt: string }>;
            createdAt: string;
          }>)
        : undefined,
      createdAt: mapTs(d.createdAt),
      updatedAt: mapTs(d.updatedAt),
    };
  }

  const ref = await db.collection("opportunities").add({
    name: input.name?.trim() || (typeof cd.name === "string" ? cd.name : "Opportunity"),
    contactId,
    contactName: typeof cd.name === "string" ? cd.name : "",
    contactEmail: typeof cd.email === "string" ? cd.email : "",
    contactPhone: typeof cd.phone === "string" ? cd.phone : "",
    email: input.email?.trim() || (typeof cd.email === "string" ? cd.email : ""),
    phone: input.phone?.trim() || (typeof cd.phone === "string" ? cd.phone : ""),
    pipelineId,
    stage,
    status: input.status ?? "פתוח",
    value: typeof input.value === "number" ? input.value : null,
    utmSource: input.utmSource?.trim() || "",
    utmCampaign: input.utmCampaign?.trim() || "",
    utmMedium: input.utmMedium?.trim() || "",
    utmContent: input.utmContent?.trim() || "",
    landingpage: input.landingpage?.trim() || "",
    tags: input.tags ?? [],
    lastLeadAt: now,
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
    email: typeof d.email === "string" ? d.email : undefined,
    phone: typeof d.phone === "string" ? d.phone : undefined,
    pipelineId: String(d.pipelineId ?? pipelineId),
    stage: String(d.stage ?? stage),
    status:
      d.status === "זכיה" || d.status === "הפסד" || d.status === "פתוח"
        ? d.status
        : "פתוח",
    value: typeof d.value === "number" ? d.value : undefined,
    utmSource: typeof d.utmSource === "string" ? d.utmSource : undefined,
    utmCampaign: typeof d.utmCampaign === "string" ? d.utmCampaign : undefined,
    utmMedium: typeof d.utmMedium === "string" ? d.utmMedium : undefined,
    utmContent: typeof d.utmContent === "string" ? d.utmContent : undefined,
    landingpage: typeof d.landingpage === "string" ? d.landingpage : undefined,
    tags: Array.isArray(d.tags) ? (d.tags as string[]) : undefined,
    lastLeadAt: mapTs(d.lastLeadAt),
    customValues:
      typeof d.customValues === "object"
        ? (d.customValues as Record<string, unknown>)
        : undefined,
    assignedRep: typeof d.assignedRep === "string" ? d.assignedRep : undefined,
    notes: Array.isArray(d.notes)
      ? (d.notes as Array<{ id: string; text: string; createdAt: string; createdBy?: string }>)
      : undefined,
    tasks: Array.isArray(d.tasks)
      ? (d.tasks as Array<{
          id: string;
          title: string;
          dueAt: string;
          done: boolean;
          status?: "todo" | "in_progress" | "done";
          comments?: Array<{ id: string; text: string; createdAt: string }>;
          createdAt: string;
        }>)
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
    email: typeof d.email === "string" ? d.email : undefined,
    phone: typeof d.phone === "string" ? d.phone : undefined,
    pipelineId: String(d.pipelineId ?? ""),
    stage: String(d.stage ?? "Pending"),
    status:
      d.status === "זכיה" || d.status === "הפסד" || d.status === "פתוח"
        ? d.status
        : "פתוח",
    value: typeof d.value === "number" ? d.value : undefined,
    utmSource: typeof d.utmSource === "string" ? d.utmSource : undefined,
    utmCampaign: typeof d.utmCampaign === "string" ? d.utmCampaign : undefined,
    utmMedium: typeof d.utmMedium === "string" ? d.utmMedium : undefined,
    utmContent: typeof d.utmContent === "string" ? d.utmContent : undefined,
    landingpage: typeof d.landingpage === "string" ? d.landingpage : undefined,
    tags: Array.isArray(d.tags) ? (d.tags as string[]) : undefined,
    lastLeadAt: mapTs(d.lastLeadAt),
    customValues:
      typeof d.customValues === "object"
        ? (d.customValues as Record<string, unknown>)
        : undefined,
    assignedRep: typeof d.assignedRep === "string" ? d.assignedRep : undefined,
    notes: Array.isArray(d.notes)
      ? (d.notes as Array<{ id: string; text: string; createdAt: string; createdBy?: string }>)
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
    contactId?: string;
    pipelineId?: string;
    stage?: string;
    status?: "פתוח" | "זכיה" | "הפסד";
    value?: number | null;
    email?: string;
    phone?: string;
    utmSource?: string;
    utmCampaign?: string;
    utmMedium?: string;
    utmContent?: string;
    landingpage?: string;
    tags?: string[];
    assignedRep?: string;
    customValues?: Record<string, unknown>;
    notes?: Array<{ id: string; text: string; createdAt: string; createdBy?: string }>;
    tasks?: Array<{
      id: string;
      title: string;
      dueAt: string;
      done: boolean;
      status?: "todo" | "in_progress" | "done";
      comments?: Array<{ id: string; text: string; createdAt: string }>;
      createdAt: string;
    }>;
  }
): Promise<OpportunityRecord> {
  const db = getAdminDb();
  const ref = db.collection("opportunities").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Opportunity not found");
  const existing = (snap.data() ?? {}) as Record<string, unknown>;
  const payload: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (input.name !== undefined) payload.name = input.name.trim();
  if (input.contactId !== undefined) {
    const nextContactId = input.contactId.trim();
    if (!nextContactId) throw new Error("contactId cannot be empty");
    const contactSnap = await getAdminDb().collection("leads").doc(nextContactId).get();
    if (!contactSnap.exists) throw new Error("Contact not found");
    const cd = (contactSnap.data() ?? {}) as Record<string, unknown>;
    payload.contactId = nextContactId;
    payload.contactName = typeof cd.name === "string" ? cd.name : "";
    payload.contactEmail = typeof cd.email === "string" ? cd.email : "";
    payload.contactPhone = typeof cd.phone === "string" ? cd.phone : "";
  }
  const targetPipelineId =
    input.pipelineId !== undefined
      ? input.pipelineId.trim()
      : String(existing.pipelineId ?? "").trim();
  if (!targetPipelineId) throw new Error("pipelineId is required");
  const pipelineSnap = await db.collection("pipelines").doc(targetPipelineId).get();
  if (!pipelineSnap.exists) throw new Error("Pipeline not found");
  const pipelineData = (pipelineSnap.data() ?? {}) as Record<string, unknown>;
  const stages = normalizeStages((pipelineData.stages as string[] | undefined) ?? []);
  if (stages.length === 0) throw new Error("Pipeline must contain stages");
  if (input.pipelineId !== undefined) payload.pipelineId = targetPipelineId;
  if (input.stage !== undefined) {
    const nextStage = input.stage.trim();
    payload.stage = stages.includes(nextStage) ? nextStage : stages[0];
  } else if (input.pipelineId !== undefined) {
    const currentStage = String(existing.stage ?? "").trim();
    payload.stage = stages.includes(currentStage) ? currentStage : stages[0];
  }
  if (input.status !== undefined) payload.status = input.status;
  if (input.value !== undefined) payload.value = input.value;
  if (input.email !== undefined) payload.email = input.email.trim();
  if (input.phone !== undefined) payload.phone = input.phone.trim();
  if (input.utmSource !== undefined) payload.utmSource = input.utmSource.trim();
  if (input.utmCampaign !== undefined) payload.utmCampaign = input.utmCampaign.trim();
  if (input.utmMedium !== undefined) payload.utmMedium = input.utmMedium.trim();
  if (input.utmContent !== undefined) payload.utmContent = input.utmContent.trim();
  if (input.landingpage !== undefined) payload.landingpage = input.landingpage.trim();
  if (input.tags !== undefined) payload.tags = Array.from(new Set(input.tags.map((x) => x.trim()).filter(Boolean)));
  if (input.assignedRep !== undefined) payload.assignedRep = input.assignedRep.trim();
  if (input.customValues !== undefined) payload.customValues = input.customValues;
  if (input.notes !== undefined) payload.notes = input.notes;
  if (input.tasks !== undefined) payload.tasks = input.tasks;
  await ref.set(payload, { merge: true });

  // Keep contact-level activity history synced with opportunity activity.
  if (input.notes !== undefined || input.tasks !== undefined) {
    const existing = (snap.data() ?? {}) as Record<string, unknown>;
    const contactId = String(
      input.contactId?.trim() || existing.contactId || ""
    ).trim();
    if (contactId) {
      const contactRef = getAdminDb().collection("leads").doc(contactId);
      const contactSnap = await contactRef.get();
      if (contactSnap.exists) {
        const cd = (contactSnap.data() ?? {}) as Record<string, unknown>;
        const contactNotes = Array.isArray(cd.notes)
          ? (cd.notes as Array<{ id: string; text: string; createdAt: string; createdBy?: string }>)
          : [];
        const contactTasks = Array.isArray(cd.tasks)
          ? (cd.tasks as Array<{
              id: string;
              title: string;
              dueAt: string;
              done: boolean;
              status?: "todo" | "in_progress" | "done";
              comments?: Array<{ id: string; text: string; createdAt: string }>;
              createdAt: string;
            }>)
          : [];
        const nextNotes = input.notes ?? [];
        const nextTasks = input.tasks ?? [];

        const notesMap = new Map(contactNotes.map((n) => [n.id, n]));
        for (const n of nextNotes) notesMap.set(n.id, n);
        const tasksMap = new Map(contactTasks.map((t) => [t.id, t]));
        for (const t of nextTasks) tasksMap.set(t.id, t);

        await contactRef.set(
          {
            notes: Array.from(notesMap.values()),
            tasks: Array.from(tasksMap.values()),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }
  }
  const again = await ref.get();
  return (await getOpportunityById(again.id)) as OpportunityRecord;
}

export async function updatePipeline(
  id: string,
  input: { name?: string; stages?: string[] }
): Promise<PipelineRecord> {
  const db = getAdminDb();
  const ref = db.collection("pipelines").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Pipeline not found");
  const prev = (snap.data() ?? {}) as Record<string, unknown>;
  const prevStages = normalizeStages((prev.stages as string[] | undefined) ?? []);
  const nextStages = input.stages ? normalizeStages(input.stages) : undefined;
  const payload: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (input.name !== undefined) payload.name = input.name.trim();
  if (nextStages !== undefined) {
    if (nextStages.length === 0) throw new Error("At least one stage is required");
    payload.stages = nextStages;
  }
  await ref.set(payload, { merge: true });

  // If stages were removed, move opportunities from removed stage
  // to the nearest previous remaining stage (fallback to first stage).
  if (nextStages) {
    const nextSet = new Set(nextStages);
    const removed = prevStages.filter((s) => !nextSet.has(s));
    if (removed.length) {
      const opportunitiesSnap = await db
        .collection("opportunities")
        .where("pipelineId", "==", id)
        .get();
      for (const removedStage of removed) {
        const removedIdx = prevStages.indexOf(removedStage);
        let fallback = nextStages[0];
        for (let i = removedIdx - 1; i >= 0; i--) {
          const candidate = prevStages[i];
          if (nextSet.has(candidate)) {
            fallback = candidate;
            break;
          }
        }
        const batch = db.batch();
        let touched = 0;
        for (const doc of opportunitiesSnap.docs) {
          const d = (doc.data() ?? {}) as Record<string, unknown>;
          if (String(d.stage ?? "") === removedStage) {
            batch.set(
              doc.ref,
              { stage: fallback, updatedAt: FieldValue.serverTimestamp() },
              { merge: true }
            );
            touched++;
          }
        }
        if (touched > 0) await batch.commit();
      }
    }
  }

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

export async function duplicatePipeline(id: string): Promise<PipelineRecord> {
  const db = getAdminDb();
  const src = await db.collection("pipelines").doc(id).get();
  if (!src.exists) throw new Error("Pipeline not found");
  const d = (src.data() ?? {}) as Record<string, unknown>;
  const name = String(d.name ?? "").trim();
  const stages = normalizeStages((d.stages as string[] | undefined) ?? []);
  if (!name || stages.length === 0) throw new Error("Pipeline has invalid data");
  return createPipeline({
    name: `${name} (copy)`,
    stages,
  });
}

export async function deletePipeline(id: string): Promise<void> {
  if (id === "default-sales") {
    throw new Error("Default pipeline cannot be deleted");
  }
  const db = getAdminDb();
  const snap = await db.collection("opportunities").where("pipelineId", "==", id).limit(1).get();
  if (!snap.empty) {
    throw new Error("Cannot delete pipeline with existing opportunities");
  }
  await db.collection("pipelines").doc(id).delete();
}


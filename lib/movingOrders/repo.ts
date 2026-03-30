import { randomUUID } from "crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { validateCustomValues } from "@/lib/customFields/repo";
import { listLeadsFiltered } from "@/lib/leads/repo";
import { rawCustomValuesFromPayload } from "@/lib/movingOrders/customValuesFromPayload";
import { ensureMovingOrdersIntakePipeline } from "@/lib/movingOrders/ensureIntakePipeline";
import { getCityRegionMap } from "@/lib/movingOrders/cityRegionSettingsRepo";
import { matchDriversForOrder } from "@/lib/movingOrders/matchDrivers";
import { MOVING_ORDERS_INTAKE_PIPELINE_ID, MOVING_ORDER_STAGES } from "@/lib/movingOrders/pipelineConstants";
import { defaultStageForStatus, statusFromStage } from "@/lib/movingOrders/stageSync";
import type { MovingOrderPayload, MovingOrderRecord, MovingOrderStatus } from "@/lib/movingOrders/types";

const COLLECTION = "movingOrders";

function mapTs(ts: unknown): string | null {
  if (ts && typeof ts === "object" && "toDate" in ts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (ts as any).toDate?.() as Date | undefined;
    return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
  }
  return null;
}

function sanitizeDocId(orderId: string): string {
  return orderId.trim().replace(/[/\\]/g, "_").slice(0, 800) || "unknown";
}

const STATUSES: MovingOrderStatus[] = ["pending", "dispatched", "completed", "cancelled"];

function coerceStatus(raw: unknown): MovingOrderStatus {
  return STATUSES.includes(raw as MovingOrderStatus) ? (raw as MovingOrderStatus) : "pending";
}

function normalizeOrderStage(
  data: Record<string, unknown>,
  payload: MovingOrderPayload,
  status: MovingOrderStatus
): string {
  const rawStage = typeof data.stage === "string" ? data.stage : "";
  if (rawStage.trim()) return rawStage.trim();
  return defaultStageForStatus(status);
}

function mapDoc(id: string, data: Record<string, unknown>): MovingOrderRecord {
  const payload = (data.payload as MovingOrderPayload) ?? { order_id: id };
  const status = coerceStatus(data.status);
  const pipelineId = String(data.pipelineId ?? MOVING_ORDERS_INTAKE_PIPELINE_ID).trim() || MOVING_ORDERS_INTAKE_PIPELINE_ID;
  const stage = normalizeOrderStage(data, payload, status);
  const customValues =
    typeof data.customValues === "object" && data.customValues !== null
      ? (data.customValues as Record<string, unknown>)
      : undefined;
  return {
    id,
    orderId: String(data.orderId ?? payload.order_id ?? id),
    pipelineId,
    stage,
    customValues,
    status,
    payload,
    matchedDriverIds: Array.isArray(data.matchedDriverIds)
      ? (data.matchedDriverIds as unknown[]).map((x) => String(x))
      : [],
    optionalDriverIds: Array.isArray(data.optionalDriverIds)
      ? (data.optionalDriverIds as unknown[]).map((x) => String(x))
      : [],
    manualDriverIds: Array.isArray(data.manualDriverIds)
      ? (data.manualDriverIds as unknown[]).map((x) => String(x))
      : [],
    excludedDriverIds: Array.isArray(data.excludedDriverIds)
      ? (data.excludedDriverIds as unknown[]).map((x) => String(x))
      : [],
    dispatchedAt: typeof data.dispatchedAt === "string" ? data.dispatchedAt : mapTs(data.dispatchedAt),
    createdAt: mapTs(data.createdAt),
    updatedAt: mapTs(data.updatedAt),
  };
}

export async function listMovingOrders(
  opts: { pipelineId?: string | null; db?: Firestore } = {}
): Promise<MovingOrderRecord[]> {
  await ensureMovingOrdersIntakePipeline();
  const d = opts.db ?? (await getAdminDb());
  let snap;
  if (opts.pipelineId?.trim()) {
    snap = await d
      .collection(COLLECTION)
      .where("pipelineId", "==", opts.pipelineId.trim())
      .limit(400)
      .get();
  } else {
    snap = await d.collection(COLLECTION).limit(400).get();
  }
  const rows = snap.docs.map((doc) => mapDoc(doc.id, (doc.data() ?? {}) as Record<string, unknown>));
  rows.sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
  return rows.slice(0, 200);
}

export async function getMovingOrder(id: string, db?: Firestore): Promise<MovingOrderRecord | null> {
  const d = db ?? (await getAdminDb());
  const snap = await d.collection(COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return mapDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
}

export async function upsertMovingOrderFromIngest(
  payload: MovingOrderPayload,
  db?: Firestore
): Promise<MovingOrderRecord> {
  await ensureMovingOrdersIntakePipeline();
  const d = db ?? (await getAdminDb());
  const orderId = String(payload.order_id ?? "").trim();
  if (!orderId) throw new Error("order_id is required");

  const docId = sanitizeDocId(orderId);
  const leads = await listLeadsFiltered();
  const settlementRegionMap = await getCityRegionMap();
  const { matched, optional } = matchDriversForOrder(leads, payload, settlementRegionMap);

  const matchedIds = matched.map((l) => l.id);
  const optionalIds = optional.map((l) => l.id);

  const ref = d.collection(COLLECTION).doc(docId);
  const prev = await ref.get();
  const prevData = prev.exists ? (prev.data() ?? {}) : {};

  const prevManual = Array.isArray(prevData.manualDriverIds)
    ? (prevData.manualDriverIds as unknown[]).map((x) => String(x))
    : [];
  const prevExcluded = Array.isArray(prevData.excludedDriverIds)
    ? (prevData.excludedDriverIds as unknown[]).map((x) => String(x))
    : [];

  const now = FieldValue.serverTimestamp();
  const knownIds = new Set([...matchedIds, ...optionalIds, ...prevManual]);
  const excludedDriverIds = prevExcluded.filter((x) => knownIds.has(x));

  const rawCustom = rawCustomValuesFromPayload(payload);
  const existingCustom =
    typeof prevData.customValues === "object" && prevData.customValues !== null
      ? (prevData.customValues as Record<string, unknown>)
      : {};
  const customValues = await validateCustomValues("moving_order", { ...existingCustom, ...rawCustom }, {
    pipelineId: MOVING_ORDERS_INTAKE_PIPELINE_ID,
    previousValues: existingCustom,
  });

  if (prev.exists) {
    const prevStatus = coerceStatus(prevData.status);
    const prevStage = typeof prevData.stage === "string" ? prevData.stage : "";
    await ref.set(
      {
        orderId,
        payload,
        customValues,
        matchedDriverIds: matchedIds,
        optionalDriverIds: optionalIds,
        excludedDriverIds,
        updatedAt: now,
        ...(prevStage.trim() ? {} : { stage: MOVING_ORDER_STAGES[0], status: "pending" }),
      },
      { merge: true }
    );
  } else {
    await ref.set(
      {
        orderId,
        payload,
        customValues,
        pipelineId: MOVING_ORDERS_INTAKE_PIPELINE_ID,
        stage: MOVING_ORDER_STAGES[0],
        matchedDriverIds: matchedIds,
        optionalDriverIds: optionalIds,
        manualDriverIds: [],
        excludedDriverIds: [],
        createdAt: now,
        updatedAt: now,
        status: "pending" as MovingOrderStatus,
        dispatchedAt: null,
      },
      { merge: true }
    );
  }
  const again = await ref.get();
  return mapDoc(again.id, (again.data() ?? {}) as Record<string, unknown>);
}

export async function createMovingOrderManual(
  input: {
    pipelineId: string;
    stage: string;
    name?: string;
    phone?: string;
    pickup?: string;
    dropoff?: string;
    date?: string;
    order_id?: string;
  },
  db?: Firestore
): Promise<MovingOrderRecord> {
  await ensureMovingOrdersIntakePipeline();
  const d = db ?? (await getAdminDb());
  const orderId =
    input.order_id?.trim() ||
    `manual-${Date.now()}-${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const docId = sanitizeDocId(orderId);
  const ref = d.collection(COLLECTION).doc(docId);
  const prev = await ref.get();
  if (prev.exists) throw new Error("מזהה הזמנה כבר קיים");

  const payload: MovingOrderPayload = {
    order_id: orderId,
    name: input.name?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    pickup: input.pickup?.trim() || undefined,
    dropoff: input.dropoff?.trim() || undefined,
    date: input.date?.trim() || undefined,
  };

  const leads = await listLeadsFiltered();
  const settlementRegionMap = await getCityRegionMap();
  const { matched, optional } = matchDriversForOrder(leads, payload, settlementRegionMap);
  const matchedIds = matched.map((l) => l.id);
  const optionalIds = optional.map((l) => l.id);

  const rawCustom = rawCustomValuesFromPayload(payload);
  const pid = input.pipelineId.trim() || MOVING_ORDERS_INTAKE_PIPELINE_ID;
  const st = input.stage.trim() || MOVING_ORDER_STAGES[0];
  const customValues = await validateCustomValues("moving_order", rawCustom, {
    pipelineId: pid,
  });

  const now = FieldValue.serverTimestamp();
  await ref.set({
    orderId,
    payload,
    customValues,
    pipelineId: pid,
    stage: st,
    matchedDriverIds: matchedIds,
    optionalDriverIds: optionalIds,
    manualDriverIds: [],
    excludedDriverIds: [],
    createdAt: now,
    updatedAt: now,
    status: "pending" as MovingOrderStatus,
    dispatchedAt: null,
  });
  const again = await ref.get();
  return mapDoc(again.id, (again.data() ?? {}) as Record<string, unknown>);
}

export async function updateMovingOrder(
  id: string,
  input: {
    status?: MovingOrderStatus;
    stage?: string;
    pipelineId?: string;
    customValues?: Record<string, unknown>;
    payload?: Partial<MovingOrderPayload>;
    excludedDriverIds?: string[];
    manualDriverIds?: string[];
    dispatchedAt?: string | null;
  },
  db?: Firestore
): Promise<MovingOrderRecord> {
  const d = db ?? (await getAdminDb());
  const ref = d.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("הזמנה לא נמצאה");

  const existing = (snap.data() ?? {}) as Record<string, unknown>;
  const prevCustom =
    typeof existing.customValues === "object" && existing.customValues !== null
      ? (existing.customValues as Record<string, unknown>)
      : {};
  const effPipe = String(
    input.pipelineId !== undefined
      ? input.pipelineId.trim() || MOVING_ORDERS_INTAKE_PIPELINE_ID
      : existing.pipelineId ?? MOVING_ORDERS_INTAKE_PIPELINE_ID
  ).trim();

  const payload: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

  if (input.pipelineId !== undefined) {
    payload.pipelineId = input.pipelineId.trim() || MOVING_ORDERS_INTAKE_PIPELINE_ID;
  }

  if (input.payload !== undefined && typeof input.payload === "object") {
    const cur = (existing.payload as MovingOrderPayload) ?? { order_id: String(existing.orderId ?? id) };
    const next: MovingOrderPayload = {
      ...cur,
      ...input.payload,
      order_id:
        String(cur.order_id ?? input.payload.order_id ?? existing.orderId ?? id ?? "").trim() ||
        String(existing.orderId ?? id),
    };
    if (!String(next.order_id ?? "").trim()) throw new Error("חסר order_id בפיילואד");
    const leads = await listLeadsFiltered();
    const settlementRegionMap = await getCityRegionMap();
    const { matched, optional } = matchDriversForOrder(leads, next, settlementRegionMap);
    payload.payload = next;
    payload.matchedDriverIds = matched.map((l) => l.id);
    payload.optionalDriverIds = optional.map((l) => l.id);
    const rawCustom = rawCustomValuesFromPayload(next);
    payload.customValues = await validateCustomValues("moving_order", { ...prevCustom, ...rawCustom }, {
      pipelineId: effPipe,
      previousValues: prevCustom,
    });
  }

  if (input.customValues !== undefined) {
    const baseline =
      (payload.customValues as Record<string, unknown> | undefined) ?? prevCustom;
    payload.customValues = await validateCustomValues(
      "moving_order",
      { ...baseline, ...input.customValues },
      { pipelineId: effPipe, previousValues: baseline }
    );
  }

  if (input.stage !== undefined) {
    const st = input.stage.trim() || MOVING_ORDER_STAGES[0];
    payload.stage = st;
    payload.status = statusFromStage(st);
  } else if (input.status !== undefined) {
    payload.status = input.status;
    payload.stage = defaultStageForStatus(input.status);
  }

  if (input.excludedDriverIds !== undefined) payload.excludedDriverIds = input.excludedDriverIds;
  if (input.manualDriverIds !== undefined) payload.manualDriverIds = input.manualDriverIds;
  if (input.dispatchedAt !== undefined) payload.dispatchedAt = input.dispatchedAt;

  const mergedStatus =
    payload.status !== undefined ? coerceStatus(payload.status) : coerceStatus(existing.status);
  if (
    mergedStatus === "dispatched" &&
    input.dispatchedAt === undefined &&
    !existing.dispatchedAt &&
    payload.dispatchedAt === undefined
  ) {
    payload.dispatchedAt = new Date().toISOString();
  }

  await ref.set(payload, { merge: true });
  const again = await ref.get();
  return mapDoc(again.id, (again.data() ?? {}) as Record<string, unknown>);
}

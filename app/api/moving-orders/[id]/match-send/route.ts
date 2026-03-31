import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getLeadById } from "@/lib/leads/repo";
import { getPayingCustomersPipelineId, listOpportunities } from "@/lib/opportunities/repo";
import { assertMovingOrdersWorkspace } from "@/lib/movingOrders/guard";
import {
  applyMatchSendSideEffects,
  buildMatchWebhookMovers,
} from "@/lib/movingOrders/matchOrderActions";
import { opportunitiesByContactId } from "@/lib/movingOrders/matchMovers";
import { getMovingOrder, updateMovingOrder } from "@/lib/movingOrders/repo";
import { MOVING_ORDER_STAGES } from "@/lib/movingOrders/pipelineConstants";
import type { MovingOrderRecord } from "@/lib/movingOrders/types";
import { postWebhookForEvent } from "@/lib/webhooks/dispatchServerWebhooks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function defaultSelectedIds(order: MovingOrderRecord): string[] {
  const all = [
    ...new Set([...order.matchedDriverIds, ...order.optionalDriverIds, ...order.manualDriverIds]),
  ];
  const ex = new Set(order.excludedDriverIds);
  return all.filter((x) => !ex.has(x));
}

function orderCustomerName(order: MovingOrderRecord): string {
  const cv = order.customValues ?? {};
  const n = cv.moving_order_name;
  if (typeof n === "string" && n.trim()) return n.trim();
  return order.payload.name?.trim() || order.orderId;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const g = await assertMovingOrdersWorkspace();
  if (!g.ok) {
    return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  }

  const { id } = await params;
  const order = await getMovingOrder(id, g.db);
  if (!order) {
    return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
  }

  if (order.status === "cancelled" || order.status === "rejected" || order.status === "completed") {
    return NextResponse.json({ ok: false, error: "הזמנה לא זמינה לשליחה" }, { status: 400 });
  }

  let driverIds: string[];
  try {
    const body = (await req.json().catch(() => ({}))) as { driverIds?: unknown };
    driverIds = Array.isArray(body.driverIds)
      ? body.driverIds.map((x) => String(x)).filter(Boolean)
      : defaultSelectedIds(order);
  } catch {
    driverIds = defaultSelectedIds(order);
  }

  if (driverIds.length === 0) {
    return NextResponse.json({ ok: false, error: "לא נבחרו מובילים" }, { status: 400 });
  }

  const leadById = new Map<string, NonNullable<Awaited<ReturnType<typeof getLeadById>>>>();
  await Promise.all(
    driverIds.map(async (did) => {
      const lead = await getLeadById(did);
      if (lead) leadById.set(did, lead);
    })
  );

  const payingPid = await getPayingCustomersPipelineId();
  const opps = await listOpportunities(payingPid);
  const oppByContact = opportunitiesByContactId(
    opps.filter((o) => (o.pipelineId ?? "").trim() === payingPid)
  );

  const movers = await buildMatchWebhookMovers(driverIds, order.driverMatchFlags, leadById, oppByContact);

  const webhookOk = await postWebhookForEvent(g.db, "moving_order_match_send", {
    movingOrderId: order.id,
    orderId: order.orderId,
    order: {
      payload: order.payload,
      customValues: order.customValues ?? {},
    },
    movers,
  });

  const on = orderCustomerName(order);
  await applyMatchSendSideEffects({
    contactIds: driverIds,
    orderCustomerName: on,
    orderId: order.orderId,
  });

  const dispatchedAt = new Date().toISOString();
  const updated = await updateMovingOrder(id, { stage: MOVING_ORDER_STAGES[1], dispatchedAt }, g.db);

  return NextResponse.json({
    ok: true,
    webhookPosted: webhookOk,
    order: updated,
  });
}

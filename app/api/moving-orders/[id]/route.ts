import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { assertMovingOrdersWorkspace } from "@/lib/movingOrders/guard";
import { getMovingOrder, updateMovingOrder } from "@/lib/movingOrders/repo";
import type { MovingOrderStatus } from "@/lib/movingOrders/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUSES = new Set<MovingOrderStatus>(["pending", "dispatched", "completed", "cancelled"]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const g = await assertMovingOrdersWorkspace();
  if (!g.ok) {
    return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  }

  const { id } = await params;
  const existing = await getMovingOrder(id, g.db);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON לא תקין" }, { status: 400 });
  }

  const patch: Parameters<typeof updateMovingOrder>[1] = {};

  if (typeof body.status === "string" && STATUSES.has(body.status as MovingOrderStatus)) {
    patch.status = body.status as MovingOrderStatus;
  }

  if (Array.isArray(body.excludedDriverIds)) {
    patch.excludedDriverIds = body.excludedDriverIds.map((x) => String(x));
  }

  if (Array.isArray(body.manualDriverIds)) {
    patch.manualDriverIds = body.manualDriverIds.map((x) => String(x));
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "אין שדות לעדכון" }, { status: 400 });
  }

  try {
    const updated = await updateMovingOrder(id, patch, g.db);
    return NextResponse.json({ ok: true, order: updated });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 }
    );
  }
}

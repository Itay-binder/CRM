import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getLeadById } from "@/lib/leads/repo";
import { assertMovingOrdersWorkspace } from "@/lib/movingOrders/guard";
import { createMovingOrderManual, listMovingOrders } from "@/lib/movingOrders/repo";
import type { DriverSummary } from "@/lib/movingOrders/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const g = await assertMovingOrdersWorkspace();
  if (!g.ok) {
    return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  }

  try {
    const pipelineId = req.nextUrl.searchParams.get("pipelineId")?.trim() || undefined;
    const orders = await listMovingOrders({ pipelineId: pipelineId ?? null, db: g.db });
    const idSet = new Set<string>();
    for (const o of orders) {
      for (const id of o.matchedDriverIds) idSet.add(id);
      for (const id of o.optionalDriverIds) idSet.add(id);
      for (const id of o.manualDriverIds) idSet.add(id);
    }
    const drivers: Record<string, DriverSummary> = {};
    await Promise.all(
      [...idSet].map(async (id) => {
        const l = await getLeadById(id);
        if (l) {
          drivers[id] = {
            id: l.id,
            name: l.name,
            phone: l.phone,
            email: l.email,
          };
        }
      })
    );
    return NextResponse.json({ ok: true, orders, drivers });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const g = await assertMovingOrdersWorkspace();
  if (!g.ok) {
    return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON לא תקין" }, { status: 400 });
  }

  const pipelineId = typeof body.pipelineId === "string" ? body.pipelineId.trim() : "";
  const stage = typeof body.stage === "string" ? body.stage.trim() : "";
  if (!pipelineId) {
    return NextResponse.json({ ok: false, error: "pipelineId נדרש" }, { status: 400 });
  }
  if (!stage) {
    return NextResponse.json({ ok: false, error: "stage נדרש" }, { status: 400 });
  }

  try {
    const order = await createMovingOrderManual(
      {
        pipelineId,
        stage,
        name: typeof body.name === "string" ? body.name : undefined,
        phone: typeof body.phone === "string" ? body.phone : undefined,
        pickup: typeof body.pickup === "string" ? body.pickup : undefined,
        dropoff: typeof body.dropoff === "string" ? body.dropoff : undefined,
        date: typeof body.date === "string" ? body.date : undefined,
        order_id: typeof body.order_id === "string" ? body.order_id : undefined,
      },
      g.db
    );
    return NextResponse.json({ ok: true, order });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getLeadById } from "@/lib/leads/repo";
import { assertMovingOrdersWorkspace } from "@/lib/movingOrders/guard";
import { listMovingOrders } from "@/lib/movingOrders/repo";
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

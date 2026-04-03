import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { createdAtInYmdRange } from "@/lib/datetime/ymdBoundary";
import { listMovingOrders } from "@/lib/movingOrders/repo";
import { assertMovingOrdersWorkspace } from "@/lib/movingOrders/guard";
import {
  getPayingCustomersPipelineId,
  getPayingCustomersPipelineMeta,
  listOpportunities,
} from "@/lib/opportunities/repo";
import type { MovingOrderRecord } from "@/lib/movingOrders/types";
import type { OpportunityRecord } from "@/lib/opportunities/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiOk = {
  ok: true;
  /** הזדמנויות בחלון (כל הפייפליינים) */
  opportunityCount: number;
  /** הזמנות בחלון */
  ordersCount: number;
  /** utm_source → ספירת הזדמנויות בחלון */
  leadsByUtmSource: Record<string, number>;
  payingCustomersPipelineId: string;
  payingCustomersPipelineName: string;
  /** הזדמנויות בפייפליין לקוחות משלמים שנוצרו בחלון */
  payingCustomersInRangeCount: number;
  /** utm_source → ספירה בפייפליין לקוחות משלמים בחלון */
  payingCustomersByUtmSource: Record<string, number>;
  /** לקוחות משלמים עם סטטוס פתוח (לא מסונן לפי תאריכים) */
  payingCustomersOpenCount: number;
  /** מוביל → מספר הזמנות משויכות; פעיל = סטטוס פתוח; ממוין: פעילים לפי כמות יורד, אחריהם לא פעילים */
  ordersPerMover: Array<{
    opportunityId: string;
    opportunityName: string;
    orderCount: number;
    isActive: boolean;
  }>;
  movingOrdersWorkspace: boolean;
  warning?: string;
};
type ApiErr = { ok: false; error: string };

function normalizeUtmKey(raw: string | undefined): string {
  const s = (raw ?? "").trim();
  return s || "—";
}

function opportunitiesInDateRange(
  opps: OpportunityRecord[],
  dateFrom?: string | null,
  dateTo?: string | null
): OpportunityRecord[] {
  const from = dateFrom?.trim();
  const to = dateTo?.trim();
  if (!from && !to) return opps;
  return opps.filter((o) => createdAtInYmdRange(o.createdAt, from, to));
}

function countByUtm(opps: OpportunityRecord[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of opps) {
    const k = normalizeUtmKey(o.utmSource);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function isPayingCustomerOpen(o: OpportunityRecord): boolean {
  return !o.status || o.status === "פתוח";
}

function driverIdsForOrder(o: MovingOrderRecord): Set<string> {
  const s = new Set<string>();
  for (const id of o.matchedDriverIds) s.add(id);
  for (const id of o.optionalDriverIds) s.add(id);
  for (const id of o.manualDriverIds) s.add(id);
  return s;
}

function buildOrdersPerMover(
  payingOpportunities: OpportunityRecord[],
  orders: MovingOrderRecord[]
): Array<{
  opportunityId: string;
  opportunityName: string;
  orderCount: number;
  isActive: boolean;
}> {
  const contactToOrders = new Map<string, MovingOrderRecord[]>();
  for (const order of orders) {
    const ids = driverIdsForOrder(order);
    for (const cid of ids) {
      const t = cid.trim();
      if (!t) continue;
      const arr = contactToOrders.get(t) ?? [];
      arr.push(order);
      contactToOrders.set(t, arr);
    }
  }

  const byCountThenName = (
    a: { orderCount: number; opportunityName: string },
    b: { orderCount: number; opportunityName: string }
  ) => b.orderCount - a.orderCount || a.opportunityName.localeCompare(b.opportunityName, "he");

  const rows = payingOpportunities
    .filter((opp) => (opp.contactId ?? "").trim())
    .map((opp) => {
      const contactId = opp.contactId.trim();
      const rawList = contactToOrders.get(contactId) ?? [];
      const seen = new Set<string>();
      let n = 0;
      for (const o of rawList) {
        if (seen.has(o.id)) continue;
        seen.add(o.id);
        n += 1;
      }
      const name = (opp.name ?? "").trim() || opp.contactName?.trim() || "ללא שם";
      return {
        opportunityId: opp.id,
        opportunityName: name,
        orderCount: n,
        isActive: isPayingCustomerOpen(opp),
      };
    });

  rows.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return byCountThenName(a, b);
  });
  return rows;
}

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, { status: auth.status });

  const dateFrom = req.nextUrl.searchParams.get("date_from");
  const dateTo = req.nextUrl.searchParams.get("date_to");

  try {
    const [payingPipelineId, payingMeta, allOpportunities] = await Promise.all([
      getPayingCustomersPipelineId(),
      getPayingCustomersPipelineMeta(),
      listOpportunities(),
    ]);

    const inRangeAll = opportunitiesInDateRange(allOpportunities, dateFrom, dateTo);
    const payingAll = allOpportunities.filter((o) => o.pipelineId === payingPipelineId);
    const payingInRange = opportunitiesInDateRange(payingAll, dateFrom, dateTo);
    const payingOpen = payingAll.filter(isPayingCustomerOpen);

    const leadsByUtmSource = countByUtm(inRangeAll);
    const payingCustomersByUtmSource = countByUtm(payingInRange);

    let ordersCount = 0;
    let ordersPerMover: ApiOk["ordersPerMover"] = [];
    let movingOrdersWorkspace = false;
    let warning: string | undefined;

    const g = await assertMovingOrdersWorkspace();
    if (g.ok) {
      movingOrdersWorkspace = true;
      const orders = await listMovingOrders({
        db: g.db,
        dateFrom,
        dateTo,
        maxFetch: 10000,
        resultLimit: null,
      });
      ordersCount = orders.length;
      ordersPerMover = buildOrdersPerMover(payingAll, orders);
    } else if (g.status !== 403) {
      warning = g.error;
    }

    const payload: ApiOk = {
      ok: true,
      opportunityCount: inRangeAll.length,
      ordersCount,
      leadsByUtmSource,
      payingCustomersPipelineId: payingPipelineId,
      payingCustomersPipelineName: payingMeta.name,
      payingCustomersInRangeCount: payingInRange.length,
      payingCustomersByUtmSource,
      payingCustomersOpenCount: payingOpen.length,
      ordersPerMover,
      movingOrdersWorkspace,
      ...(warning ? { warning } : {}),
    };
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message } satisfies ApiErr, { status: 500 });
  }
}

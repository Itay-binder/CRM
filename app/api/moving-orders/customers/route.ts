import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { listLeadsFiltered } from "@/lib/leads/repo";
import { assertMovingOrdersWorkspace } from "@/lib/movingOrders/guard";
import { leadIsPayingPipelineMoverCandidate } from "@/lib/movingOrders/moverFieldReaders";
import { getPayingCustomersPipelineMeta } from "@/lib/opportunities/repo";

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

  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const moversOnly =
    req.nextUrl.searchParams.get("moversOnly") === "1" ||
    req.nextUrl.searchParams.get("moversOnly") === "true";
  const forManualPick =
    req.nextUrl.searchParams.get("forManualPick") === "1" ||
    req.nextUrl.searchParams.get("forManualPick") === "true";

  try {
    const payingMeta = await getPayingCustomersPipelineMeta();
    const payingPipelineId = payingMeta.id;
    const leads = await listLeadsFiltered();
    let customers = leads.filter((l) => (l.pipelineId ?? "").trim() === payingPipelineId);

    if (forManualPick) {
      /* כל אנשי הקשר בפייפליין — לבחירה ידנית בהזמנה */
    } else if (moversOnly) {
      customers = customers.filter((l) => leadIsPayingPipelineMoverCandidate(l, payingPipelineId));
    }

    const filtered = q
      ? customers.filter((l) => {
          const hay = `${l.name ?? ""} ${l.phone ?? ""} ${l.email ?? ""}`.toLowerCase();
          return hay.includes(q);
        })
      : customers;

    const sorted = [...filtered].sort((a, b) =>
      (a.name ?? a.id).localeCompare(b.name ?? b.id, "he")
    );

    const limit = forManualPick ? 900 : 200;

    return NextResponse.json({
      ok: true,
      payingPipelineId: payingMeta.id,
      payingPipelineName: payingMeta.name,
      contacts: sorted.slice(0, limit).map((l) => ({
        id: l.id,
        name: l.name ?? "",
        phone: l.phone ?? "",
        email: l.email ?? "",
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

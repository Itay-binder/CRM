import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { listLeadsFiltered } from "@/lib/leads/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiOk = {
  ok: true;
  total: number;
  stageColumn?: string | null;
  countsByStage: Record<string, number>;
  warning?: string;
};
type ApiErr = { ok: false; error: string };

function normalizeStage(s: string): string {
  return (s ?? "").trim().replace(/\s+/g, " ");
}

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, { status: auth.status });

  const dateFrom = req.nextUrl.searchParams.get("date_from");
  const dateTo = req.nextUrl.searchParams.get("date_to");

  try {
    const leads = await listLeadsFiltered(dateFrom, dateTo);

    const countsByStage: Record<string, number> = {};
    for (const l of leads) {
      const key = normalizeStage(l.stage || "") || "—";
      countsByStage[key] = (countsByStage[key] ?? 0) + 1;
    }

    const payload: ApiOk = {
      ok: true,
      total: leads.length,
      stageColumn: null,
      countsByStage,
    };
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message } satisfies ApiErr, { status: 500 });
  }
}


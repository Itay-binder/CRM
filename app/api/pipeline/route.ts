import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import {
  fetchSheetMatrix,
  filterByDateRange,
  matrixToObjects,
  resolveStageColumn,
} from "@/lib/sheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiOk = {
  ok: true;
  stageColumn?: string | null;
  stages: string[];
  leadsByStage: Record<string, Record<string, string>[]>;
};
type ApiErr = { ok: false; error: string };

function normalizeStage(s: string): string {
  return (s ?? "").trim().replace(/\s+/g, " ");
}

function stageOrderFromEnv(): string[] | null {
  const raw = process.env.GOOGLE_STAGE_ORDER?.trim();
  if (!raw) return null;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, { status: auth.status });

  const dateFrom = req.nextUrl.searchParams.get("date_from");
  const dateTo = req.nextUrl.searchParams.get("date_to");

  try {
    const matrix = await fetchSheetMatrix();
    const { headers, records } = matrixToObjects(matrix);
    const filtered = filterByDateRange(records, headers, dateFrom, dateTo);

    const stageCol = resolveStageColumn(headers);
    if (!stageCol) {
      return NextResponse.json({
        ok: true,
        stageColumn: null,
        stages: ["All"],
        leadsByStage: { All: filtered },
      } satisfies ApiOk);
    }

    const stageSet = new Set<string>();
    const leadsByStage: Record<string, Record<string, string>[]> = {};
    for (const r of filtered) {
      const st = normalizeStage(r[stageCol] ?? "");
      const key = st || "—";
      stageSet.add(key);
      (leadsByStage[key] ||= []).push(r);
    }

    const order = stageOrderFromEnv();
    let stages = Array.from(stageSet);
    if (order) {
      const ordered = order.filter((s) => stageSet.has(s));
      const rest = stages.filter((s) => !ordered.includes(s)).sort();
      stages = [...ordered, ...rest];
    } else {
      stages = stages.sort();
    }

    const payload: ApiOk = {
      ok: true,
      stageColumn: stageCol,
      stages,
      leadsByStage,
    };
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message } satisfies ApiErr, { status: 500 });
  }
}


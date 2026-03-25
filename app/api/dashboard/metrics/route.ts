import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { fetchSheetMatrix, matrixToObjects, filterByDateRange, resolveStageColumn } from "@/lib/sheets";

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
    const matrix = await fetchSheetMatrix();
    const { headers, records } = matrixToObjects(matrix);
    const filtered = filterByDateRange(records, headers, dateFrom, dateTo);

    const stageCol = resolveStageColumn(headers);
    if (!stageCol) {
      return NextResponse.json({
        ok: true,
        total: filtered.length,
        stageColumn: null,
        countsByStage: {},
        warning: "לא נמצאה עמודת סטטוס בשיטס. כרגע מדדים לפי סטטוס לא יוצגו.",
      } satisfies ApiOk);
    }

    const countsByStage: Record<string, number> = {};
    for (const r of filtered) {
      const st = normalizeStage(r[stageCol] ?? "");
      const key = st || "—";
      countsByStage[key] = (countsByStage[key] ?? 0) + 1;
    }

    const payload: ApiOk = {
      ok: true,
      total: filtered.length,
      stageColumn: stageCol,
      countsByStage,
    };
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message } satisfies ApiErr, { status: 500 });
  }
}


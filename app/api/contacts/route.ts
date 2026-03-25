import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import {
  fetchSheetMatrix,
  matrixToObjects,
  resolveUniqueContactColumn,
  uniqueBy,
  filterByDateRange,
} from "@/lib/sheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiOk = {
  ok: true;
  headers: string[];
  uniqueContactColumn?: string | null;
  count: number;
  rows: Record<string, string>[];
};
type ApiErr = { ok: false; error: string };

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok)
    return NextResponse.json(
      { ok: false, error: auth.error } satisfies ApiErr,
      { status: auth.status }
    );

  const dateFrom = req.nextUrl.searchParams.get("date_from");
  const dateTo = req.nextUrl.searchParams.get("date_to");

  try {
    const matrix = await fetchSheetMatrix();
    const { headers, records } = matrixToObjects(matrix);
    const filtered = filterByDateRange(records, headers, dateFrom, dateTo);

    const uniqCol = resolveUniqueContactColumn(headers);
    const deduped = uniqCol ? uniqueBy(filtered, uniqCol) : filtered;

    const payload: ApiOk = {
      ok: true,
      headers,
      uniqueContactColumn: uniqCol,
      count: deduped.length,
      rows: deduped,
    };
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: message } satisfies ApiErr,
      { status: 500 }
    );
  }
}


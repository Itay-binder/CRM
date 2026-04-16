import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { listLeadsFiltered } from "@/lib/leads/repo";
import {
  filterLeadsByAudience,
  type AudienceCondition,
  type AudienceLogic,
} from "@/lib/whatsapp/audienceFilter";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: {
    conditions?: AudienceCondition[];
    logic?: AudienceLogic;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const conditions = Array.isArray(body.conditions) ? body.conditions : [];
  const logic: AudienceLogic = body.logic === "or" ? "or" : "and";

  try {
    const leads = await listLeadsFiltered(null, null);
    const matched = filterLeadsByAudience(leads, conditions, logic);
    const ids = matched.map((l) => l.id);
    return NextResponse.json({
      ok: true,
      count: matched.length,
      sampleIds: ids.slice(0, 40),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

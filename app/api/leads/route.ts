import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { upsertLead, listLeadsFiltered } from "@/lib/leads/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiOk = { ok: true; lead: { id: string; stage: string } };
type ApiErr = { ok: false; error: string };

function getIngestApiKeyFromHeader(req: NextRequest): string | null {
  const direct = req.headers.get("x-crm-api-key");
  if (direct?.trim()) return direct.trim();
  const authz = req.headers.get("authorization");
  if (authz?.startsWith("Bearer ")) return authz.slice(7).trim();
  return null;
}

function checkIngestAuth(req: NextRequest): boolean {
  const expected = process.env.CRM_INGEST_API_KEY?.trim();
  if (!expected) return false;
  const provided = getIngestApiKeyFromHeader(req);
  return Boolean(provided && provided === expected);
}

export async function POST(req: NextRequest) {
  if (!checkIngestAuth(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" } satisfies ApiErr, {
      status: 401,
    });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const input = body as any;
    const lead = await upsertLead(input);
    const payload: ApiOk = { ok: true, lead: { id: lead.id, stage: lead.stage } };
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message } satisfies ApiErr, { status: 400 });
  }
}

/**
 * Optional admin/debug endpoint.
 * Browser UI uses `/api/contacts` instead.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, { status: auth.status });
  }

  const dateFrom = req.nextUrl.searchParams.get("date_from");
  const dateTo = req.nextUrl.searchParams.get("date_to");

  try {
    const leads = await listLeadsFiltered(dateFrom, dateTo);
    return NextResponse.json({
      ok: true,
      count: leads.length,
      leads: leads.slice(0, 1000).map((l) => ({ id: l.id, email: l.email, phone: l.phone, name: l.name, stage: l.stage })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message } satisfies ApiErr, { status: 500 });
  }
}


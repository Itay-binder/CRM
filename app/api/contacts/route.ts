import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { listLeadsFiltered, upsertLead } from "@/lib/leads/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiOk = {
  ok: true;
  headers: string[];
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
    const leads = await listLeadsFiltered(dateFrom, dateTo);

    // Build dynamic headers based on customFields keys too.
    const fixedHeaders = ["name", "email", "phone", "stage", "createdAt", "id"];
    const customKeys = new Set<string>();
    const rows: Record<string, string>[] = [];

    for (const l of leads) {
      const createdAt = l.createdAt ? l.createdAt.toISOString().slice(0, 10) : "";
      const customFields = l.customFields ?? {};
      for (const k of Object.keys(customFields)) customKeys.add(k);

      rows.push({
        id: l.id,
        name: l.name ?? "",
        email: l.email ?? "",
        phone: l.phone ?? "",
        stage: l.stage ?? "",
        createdAt,
        ...Object.fromEntries(
          Object.entries(customFields).map(([k, v]) => [k, v == null ? "" : String(v)])
        ),
      });
    }

    const headers = [...fixedHeaders, ...Array.from(customKeys).sort()];

    const payload: ApiOk = {
      ok: true,
      headers,
      count: rows.length,
      rows,
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

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error } satisfies ApiErr,
      { status: auth.status }
    );
  }

  try {
    const body = (await req.json()) as {
      email?: string;
      phone?: string;
      name?: string;
      firstName?: string;
      lastName?: string;
      stage?: string;
      source?: string;
      customFields?: Record<string, unknown>;
      uniqueKey?: string;
    };

    const lead = await upsertLead({
      uniqueKey: body.uniqueKey,
      email: body.email,
      phone: body.phone,
      name: body.name,
      firstName: body.firstName,
      lastName: body.lastName,
      stage: body.stage ?? "Pending",
      source: body.source ?? "manual",
      customFields: body.customFields ?? {},
    });

    return NextResponse.json({
      ok: true,
      lead: {
        id: lead.id,
        email: lead.email ?? "",
        phone: lead.phone ?? "",
        name: lead.name ?? "",
        stage: lead.stage,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: message } satisfies ApiErr,
      { status: 400 }
    );
  }
}


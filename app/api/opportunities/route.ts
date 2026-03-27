import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { createOpportunity, listOpportunities } from "@/lib/opportunities/repo";
import { validateCustomValues } from "@/lib/customFields/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error } satisfies ApiErr,
      { status: auth.status }
    );
  }

  const pipelineId = req.nextUrl.searchParams.get("pipelineId");

  try {
    const opportunities = await listOpportunities(pipelineId);
    return NextResponse.json({ ok: true, opportunities });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
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
      name?: string;
      contactId?: string;
      pipelineId?: string;
      stage?: string;
      status?: "פתוח" | "זכיה" | "הפסד";
      value?: number;
      email?: string;
      phone?: string;
      utmSource?: string;
      utmCampaign?: string;
      utmMedium?: string;
      utmContent?: string;
      landingpage?: string;
      tags?: string[];
      customValues?: Record<string, unknown>;
      assignedRep?: string;
    };
    const customValues = await validateCustomValues(
      "opportunity",
      body.customValues
    );
    const created = await createOpportunity({
      name: body.name,
      contactId: body.contactId ?? "",
      pipelineId: body.pipelineId ?? "",
      stage: body.stage,
      status: body.status,
      value: body.value,
      email: body.email,
      phone: body.phone,
      utmSource: body.utmSource,
      utmCampaign: body.utmCampaign,
      utmMedium: body.utmMedium,
      utmContent: body.utmContent,
      landingpage: body.landingpage,
      tags: body.tags,
      customValues,
      assignedRep: body.assignedRep,
    });
    return NextResponse.json({ ok: true, opportunity: created });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}


import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getOpportunityById, updateOpportunity } from "@/lib/opportunities/repo";
import { validateCustomValues } from "@/lib/customFields/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;
type ApiErr = { ok: false; error: string };

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error } satisfies ApiErr,
      { status: auth.status }
    );
  }
  const { id } = await params;
  const opportunity = await getOpportunityById(id);
  if (!opportunity) {
    return NextResponse.json(
      { ok: false, error: "Opportunity not found" } satisfies ApiErr,
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true, opportunity });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error } satisfies ApiErr,
      { status: auth.status }
    );
  }
  const { id } = await params;
  try {
    const body = (await req.json()) as {
      name?: string;
      contactId?: string;
      pipelineId?: string;
      stage?: string;
      status?: "פתוח" | "זכיה" | "הפסד";
      value?: number | null;
      email?: string;
      phone?: string;
      utmSource?: string;
      utmCampaign?: string;
      utmMedium?: string;
      utmContent?: string;
      landingpage?: string;
      tags?: string[];
      assignedRep?: string;
      customValues?: Record<string, unknown>;
      notes?: Array<{ id: string; text: string; createdAt: string }>;
      tasks?: Array<{ id: string; title: string; dueAt: string; done: boolean; createdAt: string }>;
    };
    const customValues =
      body.customValues === undefined
        ? undefined
        : await validateCustomValues("opportunity", body.customValues);

    const opportunity = await updateOpportunity(id, {
      ...body,
      customValues,
    });
    return NextResponse.json({ ok: true, opportunity });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}


import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getLeadById, updateLead } from "@/lib/leads/repo";
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
  const lead = await getLeadById(id);
  if (!lead) {
    return NextResponse.json(
      { ok: false, error: "Contact not found" } satisfies ApiErr,
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true, lead });
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
      email?: string;
      phone?: string;
      stage?: string;
      assignedRep?: string;
      customFields?: Record<string, unknown>;
      notes?: Array<{ id: string; text: string; createdAt: string }>;
      tasks?: Array<{ id: string; title: string; dueAt: string; done: boolean; createdAt: string }>;
    };
    const customFields =
      body.customFields === undefined
        ? undefined
        : await validateCustomValues("contact", body.customFields);
    const lead = await updateLead(id, {
      ...body,
      customFields,
    });
    return NextResponse.json({ ok: true, lead });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}


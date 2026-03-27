import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { appendLeadNote } from "@/lib/leads/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

export async function POST(
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
      text?: string;
      createdBy?: string;
      id?: string;
      createdAt?: string;
    };
    const lead = await appendLeadNote(id, {
      text: body.text ?? "",
      createdBy: body.createdBy,
      id: body.id,
      createdAt: body.createdAt,
    });
    return NextResponse.json({ ok: true, lead });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}

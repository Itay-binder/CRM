import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { updateOpportunityStage } from "@/lib/opportunities/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error } satisfies ApiErr,
      { status: auth.status }
    );
  }

  const { id } = await ctx.params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, error: "Missing opportunity id" } satisfies ApiErr, {
      status: 400,
    });
  }

  try {
    const body = (await req.json()) as { stage?: string };
    const stage = body.stage;
    if (typeof stage !== "string" || !stage.trim()) {
      return NextResponse.json({ ok: false, error: "stage is required" } satisfies ApiErr, {
        status: 400,
      });
    }
    const opportunity = await updateOpportunityStage(id, stage);
    return NextResponse.json({ ok: true, opportunity });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}

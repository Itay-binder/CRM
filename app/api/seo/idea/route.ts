import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { generateIdeaPayload } from "@/lib/seoAgent/mockEngine";
import { getMergedSeoContextForIdeas } from "@/lib/seoAgent/seoSettingsRepo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, {
      status: auth.status,
    });
  }
  try {
    const ctx = await getMergedSeoContextForIdeas();
    const payload = await generateIdeaPayload(ctx);
    return NextResponse.json({ ok: true, ...payload });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getMoverProfilesDb } from "@/movers-profile/firestore";
import { getMoverProfileBySlug, toggleReviewHidden } from "@/movers-profile/repo";
import { isAuthorisedForManage } from "@/movers-profile/manageAuth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string; reviewId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { slug, reviewId } = await params;
  const db = getMoverProfilesDb();
  const profile = await getMoverProfileBySlug(db, slug);
  if (!profile) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  if (!(await isAuthorisedForManage(profile))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { isHidden } = await req.json();
  await toggleReviewHidden(db, profile.id, reviewId, Boolean(isHidden));
  return NextResponse.json({ ok: true });
}
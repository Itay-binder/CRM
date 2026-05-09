import { NextRequest, NextResponse } from "next/server";
import { getMoverProfilesDb } from "@/movers-profile/firestore";
import { getMoverProfileBySlug, togglePhotoHidden } from "@/movers-profile/repo";
import { getMoverSession, normalizePhoneForAuth } from "@/movers-profile/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string; photoId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { slug, photoId } = await params;
  const db = getMoverProfilesDb();
  const profile = await getMoverProfileBySlug(db, slug);
  if (!profile) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const session = await getMoverSession();
  const authed =
    session &&
    normalizePhoneForAuth(session.phone) === normalizePhoneForAuth(profile.phone);
  if (!authed) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { isHidden } = await req.json();
  await togglePhotoHidden(db, profile.id, photoId, Boolean(isHidden));
  return NextResponse.json({ ok: true });
}
import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";
import { parseFirebaseStorageDownloadUrl } from "@/lib/firebase/parseFirebaseStorageUrl";
import { getMoverProfilesDb } from "@/movers-profile/firestore";
import {
  deletePhotoDoc,
  getMoverProfileBySlug,
  togglePhotoHidden,
} from "@/movers-profile/repo";
import { isAuthorisedForManage } from "@/movers-profile/manageAuth";
import { ensureAdmin } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string; photoId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { slug, photoId } = await params;
  const db = getMoverProfilesDb();
  const profile = await getMoverProfileBySlug(db, slug);
  if (!profile) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  if (!(await isAuthorisedForManage(profile))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { isHidden } = await req.json();
  await togglePhotoHidden(db, profile.id, photoId, Boolean(isHidden));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { slug, photoId } = await params;
  const db = getMoverProfilesDb();
  const profile = await getMoverProfileBySlug(db, slug);
  if (!profile) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  if (!(await isAuthorisedForManage(profile))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const removed = await deletePhotoDoc(db, profile.id, photoId);
  if (!removed) {
    return NextResponse.json({ ok: false, error: "לא נמצאה תמונה" }, { status: 404 });
  }

  const parsed = removed.url ? parseFirebaseStorageDownloadUrl(removed.url) : null;
  if (parsed) {
    try {
      ensureAdmin();
      await admin.storage().bucket(parsed.bucket).file(parsed.objectPath).delete({ ignoreNotFound: true });
    } catch {
      /* רשומת Firestore כבר נמחקה */
    }
  }

  return NextResponse.json({ ok: true });
}
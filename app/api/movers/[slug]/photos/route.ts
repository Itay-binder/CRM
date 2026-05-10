import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getMoverProfilesDb } from "@/movers-profile/firestore";
import { getMoverProfileBySlug, addPhoto } from "@/movers-profile/repo";
import { getAdminStorageBucket } from "@/lib/firebase/admin";
import { getMoverSession, normalizePhoneForAuth } from "@/movers-profile/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  const db = getMoverProfilesDb();
  const profile = await getMoverProfileBySlug(db, slug);
  if (!profile || !profile.isActive) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "file is required" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "קובץ גדול מדי (מקסימום 15MB)" }, { status: 400 });
    }

    const session = await getMoverSession();
    const isMover =
      session &&
      normalizePhoneForAuth(session.phone) === normalizePhoneForAuth(profile.phone);

    const bucket = getAdminStorageBucket();
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
    const filePath = `mover-photos/${profile.id}/${Date.now()}.${ext}`;
    const gcsFile = bucket.file(filePath);

    // Store a download token in the object metadata so the file is accessible
    // via the Firebase Storage download URL — bypasses bucket ACL settings.
    const downloadToken = randomUUID();
    const buf = Buffer.from(await file.arrayBuffer());
    await gcsFile.save(buf, {
      metadata: {
        contentType: file.type || "image/jpeg",
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      },
    });

    const encodedPath = encodeURIComponent(filePath);
    const photoUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;

    const photo = await addPhoto(db, profile.id, {
      url: photoUrl,
      uploadedBy: isMover ? "mover" : "customer",
    });

    return NextResponse.json({ ok: true, photo });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "העלאה נכשלה" },
      { status: 500 }
    );
  }
}

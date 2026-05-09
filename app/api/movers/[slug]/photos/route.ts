import { NextRequest, NextResponse } from "next/server";
import { getMoverProfilesDb } from "@/movers-profile/firestore";
import { getMoverProfileBySlug, addPhoto } from "@/movers-profile/repo";
import { getAdminStorageBucket } from "@/lib/firebase/admin";
import { getMoverSession, normalizePhoneForAuth } from "@/movers-profile/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

// POST — initiate upload (returns signed URL) or confirm upload
// Called with { fileName, fileType } to get upload URL
// Called with { photoId } to confirm and record in Firestore
export async function POST(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  const db = getMoverProfilesDb();
  const profile = await getMoverProfileBySlug(db, slug);
  if (!profile || !profile.isActive) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const body = await req.json();

  if (body.fileName && body.fileType) {
    // Step 1: return signed upload URL
    const bucket = getAdminStorageBucket();
    const ext = String(body.fileName).split(".").pop() ?? "jpg";
    const filePath = `mover-photos/${profile.id}/${Date.now()}.${ext}`;
    const file = bucket.file(filePath);

    const [signedUrl] = await file.getSignedUrl({
      action: "write",
      expires: Date.now() + 10 * 60 * 1000, // 10 minutes
      contentType: String(body.fileType),
    });

    const photoUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    // Determine uploader
    const session = await getMoverSession();
    const isMover =
      session &&
      normalizePhoneForAuth(session.phone) === normalizePhoneForAuth(profile.phone);

    // Store a pending photo record
    const pendingRef = db
      .collection("moverProfiles")
      .doc(profile.id)
      .collection("pendingPhotos")
      .doc();
    await pendingRef.set({
      url: photoUrl,
      uploadedBy: isMover ? "mover" : "customer",
      filePath,
      createdAt: new Date(),
    });

    return NextResponse.json({
      ok: true,
      uploadUrl: signedUrl,
      photoUrl,
      photoId: pendingRef.id,
    });
  }

  return NextResponse.json({ ok: false, error: "Missing fileName/fileType" }, { status: 400 });
}

// PATCH — confirm upload after successful PUT to storage
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  const db = getMoverProfilesDb();
  const profile = await getMoverProfileBySlug(db, slug);
  if (!profile) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const { photoId } = await req.json();
  if (!photoId) return NextResponse.json({ ok: false, error: "Missing photoId" }, { status: 400 });

  const pendingRef = db
    .collection("moverProfiles")
    .doc(profile.id)
    .collection("pendingPhotos")
    .doc(String(photoId));
  const pendingDoc = await pendingRef.get();
  if (!pendingDoc.exists) {
    return NextResponse.json({ ok: false, error: "Pending photo not found" }, { status: 404 });
  }
  const pendingData = pendingDoc.data()!;

  const photo = await addPhoto(db, profile.id, {
    url: pendingData.url,
    uploadedBy: pendingData.uploadedBy,
  });

  await pendingRef.delete();
  return NextResponse.json({ ok: true, photo });
}
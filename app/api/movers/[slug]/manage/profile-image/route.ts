import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getMoverProfilesDb } from "@/movers-profile/firestore";
import { getMoverProfileBySlug } from "@/movers-profile/repo";
import { isAuthorisedForManage } from "@/movers-profile/manageAuth";
import { getAdminStorageBucket } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  const db = getMoverProfilesDb();
  const profile = await getMoverProfileBySlug(db, slug);
  if (!profile) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  if (!(await isAuthorisedForManage(profile))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "file is required" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "קובץ גדול מדי (מקסימום 10MB)" }, { status: 400 });
    }

    const bucket = getAdminStorageBucket();
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
    const filePath = `mover-profile-images/${profile.id}/profile.${ext}`;
    const gcsFile = bucket.file(filePath);

    const downloadToken = randomUUID();
    const buf = Buffer.from(await file.arrayBuffer());
    await gcsFile.save(buf, {
      metadata: {
        contentType: file.type || "image/jpeg",
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      },
    });

    const encodedPath = encodeURIComponent(filePath);
    const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;

    return NextResponse.json({ ok: true, imageUrl });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "העלאה נכשלה" },
      { status: 500 }
    );
  }
}

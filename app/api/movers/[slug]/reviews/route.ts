import { NextRequest, NextResponse } from "next/server";
import { getMoverProfilesDb } from "@/movers-profile/firestore";
import { getMoverProfileBySlug, addReview, getReviews, hasGoogleReviewed } from "@/movers-profile/repo";
import { getAdminAuth } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  const db = getMoverProfilesDb();
  const profile = await getMoverProfileBySlug(db, slug);
  if (!profile) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const reviews = await getReviews(db, profile.id, false);
  return NextResponse.json({ ok: true, reviews });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  const db = getMoverProfilesDb();
  const profile = await getMoverProfileBySlug(db, slug);
  if (!profile || !profile.isActive) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { googleIdToken, rating, text } = body as Record<string, unknown>;

  if (!googleIdToken || typeof googleIdToken !== "string") {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות עם Google" }, { status: 401 });
  }

  // Verify Google ID token
  let googleUid: string;
  let reviewerName: string;
  let reviewerPhoto: string | undefined;
  try {
    const decoded = await getAdminAuth().verifyIdToken(googleIdToken);
    googleUid = decoded.uid;
    reviewerName = decoded.name || decoded.email?.split("@")[0] || "משתמש Google";
    reviewerPhoto = decoded.picture;
  } catch {
    return NextResponse.json({ ok: false, error: "אימות Google נכשל" }, { status: 401 });
  }

  if (!text || !rating) {
    return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
  }
  const ratingNum = Number(rating);
  if (ratingNum < 1 || ratingNum > 5) {
    return NextResponse.json({ ok: false, error: "Rating must be 1-5" }, { status: 400 });
  }

  // Prevent duplicate reviews from same Google account
  const alreadyReviewed = await hasGoogleReviewed(db, profile.id, googleUid);
  if (alreadyReviewed) {
    return NextResponse.json(
      { ok: false, error: "כבר שלחת המלצה לפרופיל זה" },
      { status: 409 }
    );
  }

  const review = await addReview(db, profile.id, {
    reviewerName: reviewerName.slice(0, 60),
    rating: ratingNum,
    text: String(text).slice(0, 1000),
    googleUid,
    reviewerPhoto,
  });

  return NextResponse.json({ ok: true, review });
}

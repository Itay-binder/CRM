import { NextRequest, NextResponse } from "next/server";
import { getMoverProfilesDb } from "@/movers-profile/firestore";
import { getMoverProfileBySlug, addReview, getReviews } from "@/movers-profile/repo";

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
  const { reviewerName, rating, text } = body as Record<string, unknown>;

  if (!reviewerName || !text || !rating) {
    return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
  }
  const ratingNum = Number(rating);
  if (ratingNum < 1 || ratingNum > 5) {
    return NextResponse.json({ ok: false, error: "Rating must be 1-5" }, { status: 400 });
  }

  const review = await addReview(db, profile.id, {
    reviewerName: String(reviewerName).slice(0, 60),
    rating: ratingNum,
    text: String(text).slice(0, 1000),
  });

  return NextResponse.json({ ok: true, review });
}
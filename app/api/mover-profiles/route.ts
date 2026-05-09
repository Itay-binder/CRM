import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getMoverProfilesDb } from "@/movers-profile/firestore";
import { listMoverProfiles, createMoverProfile } from "@/movers-profile/repo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const db = getMoverProfilesDb();
  const profiles = await listMoverProfiles(db);
  return NextResponse.json({ ok: true, profiles });
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json();
  const { name, phone, slug, bio, coverArea, services } = body as Record<string, unknown>;

  if (!name || !phone || !slug) {
    return NextResponse.json({ ok: false, error: "name, phone, slug required" }, { status: 400 });
  }

  const db = getMoverProfilesDb();

  // Check slug uniqueness
  const { getMoverProfileBySlug } = await import("@/movers-profile/repo");
  const existing = await getMoverProfileBySlug(db, String(slug));
  if (existing) {
    return NextResponse.json({ ok: false, error: "סלאג זה כבר קיים" }, { status: 409 });
  }

  const profile = await createMoverProfile(db, {
    name: String(name),
    phone: String(phone),
    slug: String(slug),
    bio: bio ? String(bio) : undefined,
    coverArea: coverArea ? String(coverArea) : undefined,
    services: Array.isArray(services) ? services : [],
  });

  return NextResponse.json({ ok: true, profile });
}
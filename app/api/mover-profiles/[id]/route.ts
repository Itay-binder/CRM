import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getMoverProfilesDb } from "@/movers-profile/firestore";
import {
  getMoverProfileById,
  updateMoverProfile,
  deleteMoverProfile,
} from "@/movers-profile/repo";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { id } = await params;
  const db = getMoverProfilesDb();
  const profile = await getMoverProfileById(db, id);
  if (!profile) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, profile });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await req.json();
  const db = getMoverProfilesDb();
  await updateMoverProfile(db, id, body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { id } = await params;
  const db = getMoverProfilesDb();
  await deleteMoverProfile(db, id);
  return NextResponse.json({ ok: true });
}
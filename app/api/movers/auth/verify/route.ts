import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { getMoverProfilesDb } from "@/movers-profile/firestore";
import { getMoverProfileBySlug } from "@/movers-profile/repo";
import {
  createMoverSessionValue,
  moverSessionCookieSet,
  normalizePhoneForAuth,
} from "@/movers-profile/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { idToken, slug } = await req.json();
    if (!idToken || !slug) {
      return NextResponse.json({ ok: false, error: "Missing idToken or slug" }, { status: 400 });
    }

    // Verify the Firebase ID token (from Phone Auth)
    const auth = getAdminAuth();
    let decoded;
    try {
      decoded = await auth.verifyIdToken(String(idToken));
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
    }

    // Phone Auth token contains phone_number claim
    const phoneFromToken = decoded.phone_number;
    if (!phoneFromToken) {
      return NextResponse.json(
        { ok: false, error: "Token is not a phone auth token" },
        { status: 401 }
      );
    }

    // Check the phone matches the profile
    const db = getMoverProfilesDb();
    const profile = await getMoverProfileBySlug(db, String(slug));
    if (!profile) {
      return NextResponse.json({ ok: false, error: "Profile not found" }, { status: 404 });
    }

    const normalizedToken = normalizePhoneForAuth(phoneFromToken);
    const normalizedProfile = normalizePhoneForAuth(profile.phone);

    if (normalizedToken !== normalizedProfile) {
      return NextResponse.json(
        { ok: false, error: "מספר הטלפון אינו תואם לפרופיל זה" },
        { status: 403 }
      );
    }

    const sessionValue = createMoverSessionValue(normalizedToken);
    const cookieOpts = moverSessionCookieSet(sessionValue);

    const response = NextResponse.json({ ok: true });
    response.cookies.set(cookieOpts);
    return response;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
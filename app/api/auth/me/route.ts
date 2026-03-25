import { type NextRequest, NextResponse } from "next/server";
import { getVerifiedAuthFromRequest } from "@/lib/auth/fromRequest";
import { ensureUserDoc } from "@/lib/auth/profile";
import { authDisabled } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (authDisabled()) {
    return NextResponse.json({
      ok: true,
      authDisabled: true,
      user: null,
      profile: null,
    });
  }

  const authUser = await getVerifiedAuthFromRequest(req);
  if (!authUser) return NextResponse.json({ ok: false }, { status: 401 });

  const profile = await ensureUserDoc(authUser.uid, authUser.email);
  if (!profile.approved) {
    return NextResponse.json(
      {
        ok: false,
        error: "Not approved",
        user: { email: profile.email || authUser.email },
      },
      { status: 403 }
    );
  }

  return NextResponse.json({
    ok: true,
    authDisabled: false,
    user: { uid: authUser.uid, email: authUser.email },
    profile,
  });
}


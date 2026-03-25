import type { NextRequest } from "next/server";
import { getVerifiedAuthFromRequest } from "@/lib/auth/fromRequest";
import { ensureUserDoc } from "@/lib/auth/profile";
import { authDisabled } from "@/lib/auth/session";

export type ApprovedUser = {
  uid: string;
  email?: string;
  profile: Awaited<ReturnType<typeof ensureUserDoc>>;
};

export async function requireApprovedUser(req: NextRequest): Promise<{
  ok: true;
  user: ApprovedUser;
} | { ok: false; status: 401 | 403; error: string }> {
  if (authDisabled()) {
    return {
      ok: true,
      user: {
        uid: "dev",
        email: undefined,
        profile: { email: "", role: "admin", approved: true } as any,
      },
    };
  }

  const authUser = await getVerifiedAuthFromRequest(req);
  if (!authUser) return { ok: false, status: 401, error: "Unauthorized" };

  const profile = await ensureUserDoc(authUser.uid, authUser.email);
  if (!profile.approved) {
    return { ok: false, status: 403, error: "Not approved" };
  }

  return {
    ok: true,
    user: {
      uid: authUser.uid,
      email: authUser.email,
      profile,
    },
  };
}


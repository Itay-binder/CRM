import { cookies } from "next/headers";
import { getAdminAuth } from "@/lib/firebase/admin";
import type { UserProfile } from "@/lib/auth/types";
import { getUserProfile } from "@/lib/auth/profile";

export const SESSION_COOKIE = "__session";

export function authDisabled(): boolean {
  return process.env.AUTH_DISABLED === "true";
}

export async function getSessionUser(): Promise<
  { uid: string; email?: string } | null
> {
  if (authDisabled()) return null;
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionCookie) return null;

  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifySessionCookie(sessionCookie, true);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}

export async function getSessionWithProfile(): Promise<
  { uid: string; email?: string; profile: UserProfile } | null
> {
  const user = await getSessionUser();
  if (!user) return null;
  const profile = await getUserProfile(user.uid, user.email);
  if (!profile) return null;
  return { ...user, profile };
}


import { getAdminDb } from "@/lib/firebase/admin";
import { isAdminEmail, getUserProfile } from "@/lib/auth/profile";

export async function mayCreateSession(
  uid: string,
  email: string | undefined
): Promise<boolean> {
  if (isAdminEmail(email)) return true;

  // If user already exists - allow session even if not approved yet.
  if (email?.includes("@")) {
    const docId = email.trim().toLowerCase();
    const snap = await getAdminDb().collection("users").doc(docId).get();
    if (snap.exists) return true;
  }

  // Allow only invited emails for first login.
  if (!email?.includes("@")) return false;
  const inviteSnap = await getAdminDb().collection("invites").doc(email.trim().toLowerCase()).get();
  if (inviteSnap.exists) return true;

  return false;
}


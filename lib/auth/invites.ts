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
  const normalized = email.trim().toLowerCase();

  // 1) Try deterministic docId lookup (preferred)
  const inviteSnap = await getAdminDb().collection("invites").doc(normalized).get();
  if (inviteSnap.exists) return true;

  // 2) Fallback: look for a document by `email` field (tolerant to docId mismatch)
  const byEmailField = await getAdminDb()
    .collection("invites")
    .where("email", "==", normalized)
    .limit(1)
    .get();
  if (!byEmailField.empty) return true;

  return false;
}


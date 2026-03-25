import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { UserProfile } from "@/lib/auth/types";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function userDocumentId(email: string | undefined, uid: string): string {
  // Prefer deterministic docId = normalized email.
  if (email?.includes("@")) return normalizeEmail(email);
  return uid;
}

export function isAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  const list =
    process.env.ADMIN_EMAILS?.split(",").map((s) => s.trim().toLowerCase()) ??
    [];
  return list.includes(email.toLowerCase());
}

async function inviteExists(email: string | undefined): Promise<boolean> {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  const snap = await getAdminDb().collection("invites").doc(normalized).get();
  if (snap.exists) return true;

  // Fallback: search by `email` field.
  const byEmailField = await getAdminDb()
    .collection("invites")
    .where("email", "==", normalized)
    .limit(1)
    .get();
  return !byEmailField.empty;
}

export async function getUserProfile(
  uid: string,
  email?: string
): Promise<UserProfile | null> {
  const db = getAdminDb();
  const docId = userDocumentId(email, uid);
  const snap = await db.collection("users").doc(docId).get();
  if (!snap.exists) return null;

  const d = snap.data() as Record<string, unknown>;
  return {
    email: String(d.email ?? email ?? ""),
    role: d.role === "admin" ? "admin" : "user",
    approved: Boolean(d.approved),
    utmSource: typeof d.utmSource === "string" ? d.utmSource : undefined,
  };
}

export async function ensureUserDoc(
  uid: string,
  email: string | undefined
): Promise<UserProfile> {
  const db = getAdminDb();
  const admin = isAdminEmail(email);
  const docId = userDocumentId(email, uid);
  const ref = db.collection("users").doc(docId);

  const snap = await ref.get();
  if (snap.exists) {
    // Make sure we have email set if we got it later.
    const d = snap.data() as Record<string, unknown>;
    const existingEmail = typeof d.email === "string" ? d.email : "";
    const newEmail = email ?? existingEmail;
    if (newEmail && newEmail !== existingEmail && !admin && d.role !== "admin") {
      await ref.update({
        email: newEmail,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    const profile = await getUserProfile(uid, email);
    if (!profile) throw new Error("User doc exists but profile missing");
    return profile;
  }

  const approved = admin ? true : await inviteExists(email);
  const role: UserProfile["role"] = admin ? "admin" : "user";
  const profile: UserProfile = {
    email: email ?? "",
    role,
    approved,
  };

  await ref.set({
    ...profile,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return profile;
}


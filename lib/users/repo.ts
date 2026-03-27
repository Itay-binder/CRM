import { getAdminDb } from "@/lib/firebase/admin";

export type AdminUserOption = {
  id: string;
  email: string;
};

export async function listAdminUsers(): Promise<AdminUserOption[]> {
  const snap = await getAdminDb()
    .collection("users")
    .where("role", "==", "admin")
    .get();

  const out = snap.docs
    .map((doc) => {
      const d = (doc.data() ?? {}) as Record<string, unknown>;
      const email = String(d.email ?? doc.id).trim().toLowerCase();
      if (!email) return null;
      return { id: doc.id, email } satisfies AdminUserOption;
    })
    .filter((x): x is AdminUserOption => Boolean(x));

  return out.sort((a, b) => a.email.localeCompare(b.email, "he"));
}


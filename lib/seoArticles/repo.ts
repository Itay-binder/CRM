import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

export type SeoArticleRecord = {
  id: string;
  title: string;
  idea: string;
  keywords: string[];
  html: string;
  createdAt: Date | null;
  publishedAt: Date | null;
};

function mapTs(ts: unknown): Date | null {
  if (ts && typeof ts === "object" && "toDate" in ts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (ts as any).toDate?.() ?? null;
  }
  return null;
}

function mapDoc(id: string, d: Record<string, unknown>): SeoArticleRecord {
  return {
    id,
    title: String(d.title ?? ""),
    idea: String(d.idea ?? ""),
    keywords: Array.isArray(d.keywords) ? d.keywords.map((x) => String(x)) : [],
    html: String(d.html ?? ""),
    createdAt: mapTs(d.createdAt),
    publishedAt: mapTs(d.publishedAt),
  };
}

export async function listSeoArticles(): Promise<SeoArticleRecord[]> {
  const db = await getAdminDb();
  const snap = await db.collection("seoArticles").get();
  const out = snap.docs.map((doc) => mapDoc(doc.id, (doc.data() ?? {}) as Record<string, unknown>));
  return out.sort((a, b) => {
    const at = a.createdAt?.getTime() ?? 0;
    const bt = b.createdAt?.getTime() ?? 0;
    return bt - at;
  });
}

export async function getSeoArticle(id: string): Promise<SeoArticleRecord | null> {
  const db = await getAdminDb();
  const ref = db.collection("seoArticles").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return mapDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
}

export async function createSeoArticle(input: {
  title: string;
  idea: string;
  keywords: string[];
  html: string;
}): Promise<SeoArticleRecord> {
  const now = FieldValue.serverTimestamp();
  const db = await getAdminDb();
  const ref = await db.collection("seoArticles").add({
    title: input.title.trim(),
    idea: input.idea.trim(),
    keywords: input.keywords.map((k) => k.trim()).filter(Boolean),
    html: input.html,
    createdAt: now,
    publishedAt: null,
  });
  const snap = await ref.get();
  return mapDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
}

export async function setSeoArticlePublished(
  id: string,
  published: boolean
): Promise<SeoArticleRecord> {
  const db = await getAdminDb();
  const docRef = db.collection("seoArticles").doc(id);
  const snap = await docRef.get();
  if (!snap.exists) throw new Error("מאמר לא נמצא");
  await docRef.set(
    {
      publishedAt: published ? FieldValue.serverTimestamp() : null,
    },
    { merge: true }
  );
  const again = await docRef.get();
  return mapDoc(again.id, (again.data() ?? {}) as Record<string, unknown>);
}

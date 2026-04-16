import type { Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getTenantConfigs } from "@/lib/tenant/config";

const COLLECTION = "integrationSettings";
const DOC_ID = "seoAgentSettings";

export type SeoAgentSettingsStored = {
  siteUrl: string;
  /** מה לחפש / אילו נושאים לסרוק ברשת — מנחה את יצירת הרעיונות */
  scanFocus: string;
  businessName: string;
  businessBlurb: string;
  /** מילות מפתח ברירת מחדל (פסיקים) — משולבות ברעיון ובמאמר */
  defaultKeywordSeeds: string;
  updatedAt: string;
};

const DEFAULTS: SeoAgentSettingsStored = {
  siteUrl: "",
  scanFocus: "",
  businessName: "",
  businessBlurb: "",
  defaultKeywordSeeds: "",
  updatedAt: "",
};

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export async function getSeoAgentSettings(db: Firestore): Promise<SeoAgentSettingsStored> {
  const snap = await db.collection(COLLECTION).doc(DOC_ID).get();
  if (!snap.exists) return { ...DEFAULTS };
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  return {
    siteUrl: asString(d.siteUrl),
    scanFocus: asString(d.scanFocus),
    businessName: asString(d.businessName),
    businessBlurb: asString(d.businessBlurb),
    defaultKeywordSeeds: asString(d.defaultKeywordSeeds),
    updatedAt: asString(d.updatedAt),
  };
}

export async function saveSeoAgentSettings(
  db: Firestore,
  input: Partial<SeoAgentSettingsStored>
): Promise<SeoAgentSettingsStored> {
  const prev = await getSeoAgentSettings(db);
  const now = new Date().toISOString();
  const next: SeoAgentSettingsStored = {
    siteUrl: input.siteUrl !== undefined ? input.siteUrl.trim() : prev.siteUrl,
    scanFocus: input.scanFocus !== undefined ? input.scanFocus.trim() : prev.scanFocus,
    businessName: input.businessName !== undefined ? input.businessName.trim() : prev.businessName,
    businessBlurb: input.businessBlurb !== undefined ? input.businessBlurb.trim() : prev.businessBlurb,
    defaultKeywordSeeds:
      input.defaultKeywordSeeds !== undefined ? input.defaultKeywordSeeds.trim() : prev.defaultKeywordSeeds,
    updatedAt: now,
  };
  await db.collection(COLLECTION).doc(DOC_ID).set(next, { merge: true });
  return { ...next, updatedAt: now };
}

/** מיזוג שמור + env CRM_SEO_BUSINESS_CONTEXT + שם טננט */
export async function getMergedSeoContextForIdeas(): Promise<{
  name: string;
  blurb: string;
  siteUrl: string;
  scanFocus: string;
  defaultKeywordSeeds: string[];
}> {
  const db = await getAdminDb();
  const stored = await getSeoAgentSettings(db);

  let envName = "";
  let envBlurb = "";
  const raw = process.env.CRM_SEO_BUSINESS_CONTEXT?.trim();
  if (raw) {
    try {
      const j = JSON.parse(raw) as { name?: string; blurb?: string };
      if (j && typeof j.name === "string") envName = j.name.trim();
      if (j && typeof j.blurb === "string") envBlurb = j.blurb.trim();
    } catch {
      envBlurb = raw;
    }
  }

  const name = stored.businessName || envName || getTenantConfigs()[0]?.label?.trim() || "העסק";
  const blurb =
    stored.businessBlurb ||
    envBlurb ||
    "הגדירו בתיאור העסק בהגדרות הסוכן או במשתנה CRM_SEO_BUSINESS_CONTEXT.";

  const seeds = stored.defaultKeywordSeeds
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    name,
    blurb,
    siteUrl: stored.siteUrl.trim(),
    scanFocus: stored.scanFocus.trim(),
    defaultKeywordSeeds: seeds,
  };
}

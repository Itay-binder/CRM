import { callMetaGraphPost, graphBaseUrl } from "@/lib/metaAds/graph";
import type { MetaAdsConfig } from "@/lib/metaAds/repo";
import { normalizeAdAccountId } from "@/lib/metaAds/repo";

/**
 * opt-out מכל שיפורי creative / AI ש־v22+ מאפשרים (degrees_of_freedom);
 * advantage_audience: 1 (Advantage+ audience) — לפי בקשה.
 */

export type CreateTrafficImageCampaignInput = {
  pageId: string;
  name: string;
  /** תקציב יומי ביחידות מטבע (שקלים, דולרים, וכו׳ לפי חשבון) */
  dailyBudget: number;
  linkUrl: string;
  urlTags?: string;
  primaryText: string;
  headline: string;
  ctaType?: "LEARN_MORE" | "SHOP_NOW" | "SIGN_UP" | "APPLY_NOW" | "GET_QUOTE";
  ageMin?: number;
  ageMax?: number;
  countryCodes?: string[];
  /** Cost cap (bid cap) לתוצאה, במטבע החשבון — אופציונלי */
  costCapPerResult?: number;
  startActive?: boolean;
};

export type CreateTrafficImageCampaignResult = {
  campaignId: string;
  adSetId: string;
  creativeId: string;
  adId: string;
  imageHash: string;
  status: string;
};

function toMinor(units: number): number {
  if (!Number.isFinite(units) || units < 0) return 0;
  return Math.round(units * 100);
}

function creativeFeaturesNoAi() {
  return {
    image_template: { enroll_status: "OPT_OUT" },
    image_touchups: { enroll_status: "OPT_OUT" },
    text_optimizations: { enroll_status: "OPT_OUT" },
    inline_comment: { enroll_status: "OPT_OUT" },
    video_auto_crop: { enroll_status: "OPT_OUT" },
  };
}

export async function uploadAdImage(
  config: MetaAdsConfig,
  imageFile: { buffer: Buffer; filename: string; mime: string }
): Promise<string> {
  const adAccount = normalizeAdAccountId(config.adAccountId);
  if (!adAccount) throw new Error("חסר ad account");
  const base = graphBaseUrl().replace(/\/$/, "");
  const form = new FormData();
  const blob = new Blob([new Uint8Array(imageFile.buffer)], { type: imageFile.mime || "image/jpeg" });
  form.set("source", blob, imageFile.filename || "upload.jpg");
  const url = `${base}/act_${adAccount}/adimages?access_token=${encodeURIComponent(config.accessToken)}`;
  const res = await fetch(url, { method: "POST", body: form, cache: "no-store" });
  const j = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; error_user_msg?: string };
    images?: Record<string, { hash?: string }>;
  };
  if (!res.ok) {
    const msg = j.error?.error_user_msg || j.error?.message || `Upload failed ${res.status}`;
    throw new Error(msg);
  }
  const first = j.images && Object.values(j.images)[0];
  const h = first?.hash?.trim();
  if (!h) throw new Error("העלאת תמונה: לא חזר hash");
  return h;
}

/**
 * OUTCOME_TRAFFIC + link clicks, תמונה, Advantage+ audience, opt-out creative AI
 */
export async function createOutcomeTrafficImageCampaign(
  config: MetaAdsConfig,
  imageHash: string,
  input: CreateTrafficImageCampaignInput
): Promise<CreateTrafficImageCampaignResult> {
  const adAccount = normalizeAdAccountId(config.adAccountId);
  if (!adAccount) throw new Error("חסר ad account");
  if (!config.accessToken.trim()) throw new Error("חסר access token");
  if (!imageHash.trim()) throw new Error("חסר image hash");
  if (!input.pageId.trim()) throw new Error("חסר page_id (מזהה עמוד Facebook)");

  const baseName = input.name.trim().slice(0, 200) || `CRM ${new Date().toISOString().slice(0, 10)}`;
  const dailyMinor = toMinor(input.dailyBudget);
  if (dailyMinor < 100) throw new Error("תקציב יומי מינימום 1.00 (במטבע חשבון המודעות).");

  const link = input.linkUrl.trim();
  if (!link.startsWith("http")) throw new Error("הנחיתה חייבת להתחיל ב-https://");

  const runStatus = input.startActive ? "ACTIVE" : "PAUSED";
  const cta = input.ctaType ?? "LEARN_MORE";
  const ageMin = Math.max(18, input.ageMin ?? 18);
  const ageMax = Math.min(65, input.ageMax ?? 65);
  const countries = (input.countryCodes?.length ? input.countryCodes : ["IL"]).map((c) => c.toUpperCase());

  const capMinor =
    input.costCapPerResult != null && input.costCapPerResult > 0
      ? toMinor(input.costCapPerResult)
      : null;

  const bidBlock =
    capMinor && capMinor > 0
      ? { bid_strategy: "LOWEST_COST_WITH_BID_CAP" as const, bid_amount: String(capMinor) }
      : { bid_strategy: "LOWEST_COST_WITHOUT_CAP" as const };

  const cRes = await callMetaGraphPost<{ id?: string }>(config, `/act_${adAccount}/campaigns`, {
    name: `CRM: ${baseName}`,
    objective: "OUTCOME_TRAFFIC",
    special_ad_categories: [],
    status: runStatus,
  });
  const campaignId = cRes.id?.trim();
  if (!campaignId) throw new Error("יצירת קמפיין נכשלה");

  const adSetBody: Record<string, unknown> = {
    name: `סט ${baseName}`,
    campaign_id: campaignId,
    status: runStatus,
    daily_budget: String(dailyMinor),
    optimization_goal: "LINK_CLICKS",
    billing_event: "IMPRESSIONS",
    ...bidBlock,
    destination_type: "WEBSITE",
    targeting: {
      geo_locations: { countries },
      age_min: ageMin,
      age_max: ageMax,
      targeting_automation: { advantage_audience: 1 },
    },
  };

  const asRes = await callMetaGraphPost<{ id?: string }>(config, `/act_${adAccount}/adsets`, adSetBody);
  const adSetId = asRes.id?.trim();
  if (!adSetId) throw new Error("יצירת סט מודעות נכשלה");

  const objectStory: Record<string, unknown> = {
    page_id: input.pageId.trim(),
    link_data: {
      link,
      message: input.primaryText.slice(0, 5000),
      name: input.headline.slice(0, 255),
      image_hash: imageHash,
      call_to_action: { type: cta, value: { link } },
    },
  };

  const crBody: Record<string, unknown> = {
    name: `CR ${baseName}`.slice(0, 245),
    object_story_spec: objectStory,
    degrees_of_freedom_spec: {
      creative_features_spec: creativeFeaturesNoAi(),
    },
  };
  const tags = input.urlTags?.trim();
  if (tags) {
    crBody.url_tags = tags;
  }

  const crRes = await callMetaGraphPost<{ id?: string }>(config, `/act_${adAccount}/adcreatives`, crBody);
  const creativeId = crRes.id?.trim();
  if (!creativeId) throw new Error("יצירת creative נכשלה");

  const adRes = await callMetaGraphPost<{ id?: string }>(config, `/act_${adAccount}/ads`, {
    name: `מודעה ${baseName}`.slice(0, 240),
    adset_id: adSetId,
    status: runStatus,
    creative: { creative_id: creativeId },
  });
  const adId = adRes.id?.trim();
  if (!adId) throw new Error("יצירת מודעה נכשלה");

  return { campaignId, adSetId, creativeId, adId, imageHash, status: runStatus };
}

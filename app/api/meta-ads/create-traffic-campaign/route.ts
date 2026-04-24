import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { isAdminEmail } from "@/lib/auth/profile";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  createOutcomeTrafficImageCampaign,
  uploadAdImage,
} from "@/lib/metaAds/createTrafficCampaign";
import { getMetaAdsConfig } from "@/lib/metaAds/repo";

export const dynamic = "force-dynamic";

function canRunAdsBuilder(user: { email?: string; profile: { role: string } }): boolean {
  return isAdminEmail(user.email) || user.profile.role === "admin";
}

function toNum(s: string | null): number {
  if (s == null || s === "") return NaN;
  const n = Number.parseFloat(String(s).replace(",", "."));
  return n;
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!canRunAdsBuilder(auth.user)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "FormData required" }, { status: 400 });
  }

  const pageId = (form.get("pageId") as string)?.trim() ?? "";
  const name = (form.get("name") as string)?.trim() ?? "";
  const linkUrl = (form.get("linkUrl") as string)?.trim() ?? "";
  const urlTags = (form.get("urlTags") as string)?.trim() ?? "";
  const primaryText = (form.get("primaryText") as string)?.trim() ?? "";
  const headline = (form.get("headline") as string)?.trim() ?? "";
  const cta = ((form.get("ctaType") as string)?.trim() || "LEARN_MORE") as
    | "LEARN_MORE"
    | "SHOP_NOW"
    | "SIGN_UP"
    | "APPLY_NOW"
    | "GET_QUOTE";
  const daily = toNum((form.get("dailyBudget") as string) ?? "");
  const costCapRaw = (form.get("costCapPerResult") as string)?.trim() ?? "";
  const costCap = costCapRaw ? toNum(costCapRaw) : undefined;
  const ageMin = Math.round(toNum((form.get("ageMin") as string) ?? "18") || 18);
  const ageMax = Math.round(toNum((form.get("ageMax") as string) ?? "55") || 55);
  const countriesRaw = (form.get("countryCodes") as string)?.trim() ?? "IL";
  const startActive = (form.get("startActive") as string) === "true";
  const file = form.get("image");

  if (!pageId) {
    return NextResponse.json({ ok: false, error: "חובה: Page ID (מזהה עמוד Facebook)" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ ok: false, error: "חובה: שם קמפיין" }, { status: 400 });
  }
  if (!Number.isFinite(daily) || daily < 1) {
    return NextResponse.json(
      { ok: false, error: "תקציב יומי חייב להיות מספר ≥ 1" },
      { status: 400 }
    );
  }
  if (!linkUrl.startsWith("https://")) {
    return NextResponse.json(
      { ok: false, error: "נחיתה: כתובת https מלאה" },
      { status: 400 }
    );
  }
  if (!primaryText || !headline) {
    return NextResponse.json(
      { ok: false, error: "חובה: טקסט ראשי + כותרת" },
      { status: 400 }
    );
  }
  if (!file || typeof file === "string" || !("arrayBuffer" in file)) {
    return NextResponse.json({ ok: false, error: "חובה: קובץ תמונה" }, { status: 400 });
  }

  const f = file as File;
  const buf = Buffer.from(await f.arrayBuffer());
  if (buf.length < 200) {
    return NextResponse.json({ ok: false, error: "תמונה קטנה או פגומה" }, { status: 400 });
  }

  const ctaType =
    cta === "SHOP_NOW" || cta === "SIGN_UP" || cta === "APPLY_NOW" || cta === "GET_QUOTE"
      ? cta
      : "LEARN_MORE";
  const countryCodes = countriesRaw
    .split(/[\s,]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  try {
    const db = await getAdminDb();
    const config = await getMetaAdsConfig(db);
    if (!config?.adAccountId || !config.accessToken) {
      return NextResponse.json(
        { ok: false, error: "חסרה הגדרת Meta Ads (Ad Account + Token)" },
        { status: 400 }
      );
    }
    const imageHash = await uploadAdImage(config, {
      buffer: buf,
      filename: f.name || "ad.jpg",
      mime: f.type || "image/jpeg",
    });
    const result = await createOutcomeTrafficImageCampaign(config, imageHash, {
      pageId,
      name,
      dailyBudget: daily,
      linkUrl,
      urlTags: urlTags || undefined,
      primaryText,
      headline,
      ctaType,
      ageMin,
      ageMax,
      countryCodes,
      costCapPerResult: costCap !== undefined && Number.isFinite(costCap) && costCap > 0 ? costCap : undefined,
      startActive,
    });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 }
    );
  }
}

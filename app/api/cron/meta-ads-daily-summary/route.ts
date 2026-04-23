import { type NextRequest, NextResponse } from "next/server";
import { fallbackTenantDatabaseId, getFirestoreForDatabaseId } from "@/lib/firebase/admin";
import { listActiveMetaAdsCampaignsWithCurrency } from "@/lib/metaAds/graph";
import { buildMetaAdsDailySummaryWhatsapp } from "@/lib/metaAds/dailyWhatsappSummary";
import { getMetaAdsConfig } from "@/lib/metaAds/repo";
import { getGreenApiConfig } from "@/lib/whatsapp/repo";
import { sendTextMessageViaGreenApi } from "@/lib/whatsapp/greenapi";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_TO = "972526660006";

function tenantDb() {
  const id = process.env.CRON_METRICS_FIRESTORE_DATABASE_ID?.trim() || fallbackTenantDatabaseId();
  return getFirestoreForDatabaseId(id);
}

function normPhone(p: string): string {
  return p.replace(/[^\d]/g, "");
}

/**
 * מושך הוצאה יומית (today) לפי campaign ב-Meta Ads, בונה הודעה עם *כותרות מודגשות*,
 * ושולח ב-Green API למספר קבוע (ברירת מחדל: 972526660006).
 *
 * אבטחה: Authorization: Bearer ${CRON_SECRET}
 */
export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization") ?? "";
  if (secret) {
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured" },
      { status: 500 }
    );
  }

  const db = tenantDb();
  const [adsConfig, green] = await Promise.all([getMetaAdsConfig(db), getGreenApiConfig(db)]);

  if (!adsConfig?.adAccountId?.trim() || !adsConfig?.accessToken?.trim()) {
    return NextResponse.json(
      { ok: false, error: "חסר חיבור Meta Ads (הגדרות או Ad Account + Token) ב־CRM." },
      { status: 500 }
    );
  }
  if (!green?.instanceId?.trim() || !green?.apiTokenInstance?.trim()) {
    return NextResponse.json(
      { ok: false, error: "חסר Green API (Instance / Token) במסך GreenAPI." },
      { status: 500 }
    );
  }

  const toRaw = process.env.META_ADS_WHATSAPP_TO?.trim() || DEFAULT_TO;
  const to = normPhone(toRaw);
  if (to.length < 9) {
    return NextResponse.json({ ok: false, error: "Invalid META_ADS_WHATSAPP_TO" }, { status: 500 });
  }

  try {
    const { rows, currency } = await listActiveMetaAdsCampaignsWithCurrency(adsConfig, "today");
    const asOf = new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
    const text = buildMetaAdsDailySummaryWhatsapp({ campaigns: rows, asOf, currency });

    const j = await sendTextMessageViaGreenApi(green, { phone: to, text });

    return NextResponse.json({
      ok: true,
      messageId: j.messageId,
      to,
      campaignCount: rows.length,
      withSpend: rows.filter((c) => c.spend > 0).length,
      totalSpend: rows.reduce((a, c) => a + c.spend, 0),
      note:
        "ב-WhatsApp מודגש באמצעות *מילה*; ** לא מודגש. 'תוצאות' = לפי הזיהוי ב-Meta (כמו בממשק המודעות).",
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

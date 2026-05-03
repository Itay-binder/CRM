import type { Firestore } from "firebase-admin/firestore";
import { getGreenApiConfig } from "@/lib/whatsapp/repo";
import { sendTextMessageViaGreenApi } from "@/lib/whatsapp/greenapi";
import { getMetaAdsConfig } from "@/lib/metaAds/repo";
import { listActiveMetaAdsCampaigns, type MetaAdsCampaignVm } from "@/lib/metaAds/graph";
import { listRecentMovingOrders, type MovingOrderRecord } from "@/lib/movingOrders/repo";
import { createdAtYmdInIsrael, israelCalendarYmd } from "@/lib/cron/israelYmd";

export type MetaAdsOrdersDigestResult = {
  ok: boolean;
  error?: string;
  skipped?: string;
  /** יעד ווצאפ (ספרות בלבד) */
  targetPhone?: string;
  messagesSent?: number;
  /** סיכום מטא — "today" לפי מטא (לרוב אזור זמן חשבון המודעות) */
  metaDatePreset?: string;
  /** סיכום הזמנות — לפי תאריך יצירה בלוח שנה ישראל */
  ordersDayYmd?: string;
  campaignsCount?: number;
  totalSpend?: number;
  totalResults?: number;
  validOrdersCount?: number;
};

const DEFAULT_PHONE = "972526660006";
const WA_CHUNK = 3500;

function digitsOnly(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

function isValidSentOrder(o: MovingOrderRecord): boolean {
  if (o.status === "cancelled" || o.status === "rejected") return false;
  const sent = o.sentMatchDriverIds ?? [];
  return sent.length > 0;
}

function buildLines(
  campaigns: MetaAdsCampaignVm[],
  validOrders: MovingOrderRecord[],
  metaNote: string,
  ordersDayYmd: string
): string[] {
  const lines: string[] = [];
  lines.push("📊 דוח מודעות + הזמנות (אוטומטי)");
  lines.push(`הזמנות — יום לפי ישראל: ${ordersDayYmd}`);
  lines.push(metaNote);
  lines.push("");
  lines.push("— קמפיינים מטא (היום) —");
  if (!campaigns.length) {
    lines.push("(אין קמפיינים או אין נתונים)");
  } else {
    for (const c of campaigns) {
      lines.push(
        `• ${c.name}\n  הוצאה: ${c.spend.toFixed(2)} | תוצאות: ${c.results} | חשיפות: ${c.impressions} | קליקים: ${c.clicks}`
      );
    }
  }
  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
  const totalResults = campaigns.reduce((s, c) => s + c.results, 0);
  lines.push("");
  lines.push(`סה״כ הוצאה (מטא): ${totalSpend.toFixed(2)}`);
  lines.push(`סה״כ תוצאות (מטא): ${totalResults}`);
  lines.push("");
  lines.push("— הזמנות —");
  lines.push(
    `ספירה: נוצרו היום (ישראל), סטטוס לא מבוטל/לא נדחה, ונשלחה התאמה לפחות למוביל אחד (sentMatchDriverIds).`
  );
  lines.push(`מספר הזמנות תקינות: ${validOrders.length}`);
  if (validOrders.length && validOrders.length <= 15) {
    for (const o of validOrders) {
      lines.push(`  · ${o.orderId} — ${o.payload?.name?.trim() || "ללא שם"}`);
    }
  }
  return lines;
}

function chunkForWhatsApp(full: string): string[] {
  const t = full.trim();
  if (!t) return [];
  if (t.length <= WA_CHUNK) return [t];
  const total = Math.ceil(t.length / WA_CHUNK);
  const parts: string[] = [];
  for (let i = 0; i < total; i += 1) {
    const piece = t.slice(i * WA_CHUNK, (i + 1) * WA_CHUNK);
    parts.push(total > 1 ? `[${i + 1}/${total}]\n${piece}` : piece);
  }
  return parts;
}

export async function runMetaAdsOrdersDigestWhatsApp(input: {
  db: Firestore;
  /** מספר יעד בינלאומי, ספרות בלבד */
  targetPhone?: string;
  /** מקסימום מסמכי הזמנה לסריקה (ברירת מחדל 2500) */
  movingOrdersMaxFetch?: number;
  dryRun?: boolean;
}): Promise<MetaAdsOrdersDigestResult> {
  const targetPhone = digitsOnly(input.targetPhone?.trim() || process.env.DIGEST_WHATSAPP_PHONE || DEFAULT_PHONE);
  if (!targetPhone) {
    return { ok: false, error: "חסר מספר יעד (DIGEST_WHATSAPP_PHONE)." };
  }

  const maxFetch = Math.min(
    8000,
    Math.max(200, Number.parseInt(String(input.movingOrdersMaxFetch ?? process.env.DIGEST_MOVING_ORDERS_MAX_FETCH ?? "2500"), 10) || 2500)
  );

  const [green, metaCfg] = await Promise.all([getGreenApiConfig(input.db), getMetaAdsConfig(input.db)]);

  if (!green?.instanceId?.trim() || !green?.apiTokenInstance?.trim()) {
    return { ok: false, error: "GreenAPI לא מוגדר (integrationSettings/greenApiConfig).", targetPhone };
  }

  const ordersDayYmd = israelCalendarYmd();

  let campaigns: MetaAdsCampaignVm[] = [];
  let metaNote =
    'מטא: תקופה "today" — לרוב לפי אזור זמן חשבון המודעות בפייסבוק (לא בהכרח חצות ישראל).';

  if (metaCfg?.adAccountId?.trim() && metaCfg?.accessToken?.trim()) {
    try {
      campaigns = await listActiveMetaAdsCampaigns(metaCfg, "today");
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Meta Ads fetch failed",
        targetPhone,
        ordersDayYmd,
      };
    }
  } else {
    metaNote = "מטא: לא הוגדר חיבור Meta Ads — דילוג על קמפיינים.";
  }

  const orders = await listRecentMovingOrders({
    db: input.db,
    maxFetch,
  });

  const validOrders = orders.filter(
    (o) => createdAtYmdInIsrael(o.createdAt) === ordersDayYmd && isValidSentOrder(o)
  );

  const lines = buildLines(campaigns, validOrders, metaNote, ordersDayYmd);
  const body = lines.join("\n");

  if (input.dryRun) {
    return {
      ok: true,
      skipped: "dryRun",
      targetPhone,
      metaDatePreset: "today",
      ordersDayYmd,
      campaignsCount: campaigns.length,
      totalSpend: campaigns.reduce((s, c) => s + c.spend, 0),
      totalResults: campaigns.reduce((s, c) => s + c.results, 0),
      validOrdersCount: validOrders.length,
    };
  }

  const chunks = chunkForWhatsApp(body);
  let sent = 0;
  for (const chunk of chunks) {
    await sendTextMessageViaGreenApi(green, { phone: targetPhone, text: chunk });
    sent += 1;
  }

  return {
    ok: true,
    targetPhone,
    messagesSent: sent,
    metaDatePreset: "today",
    ordersDayYmd,
    campaignsCount: campaigns.length,
    totalSpend: campaigns.reduce((s, c) => s + c.spend, 0),
    totalResults: campaigns.reduce((s, c) => s + c.results, 0),
    validOrdersCount: validOrders.length,
  };
}

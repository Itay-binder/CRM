import type { MetaAdsCampaignVm } from "@/lib/metaAds/graph";

function fmt(n: number) {
  return n.toLocaleString("he-IL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    useGrouping: true,
  });
}

/**
 * מודגש בוואטסאפ: *טקסט* (לא Markdown **).
 */
export function buildMetaAdsDailySummaryWhatsapp(params: {
  campaigns: MetaAdsCampaignVm[];
  /** campaigns עם spend > 0; אם הכל 0 — כולל את כל הרשומות לצורך שקיפות */
  asOf: string;
  currency: string;
}): string {
  const { campaigns, asOf, currency } = params;
  const head = "סיכום הוצאה — מודעות מטא (היום, לפי אזור הזמן של חשבון המודעות)";
  const lines: string[] = [];
  lines.push(`*${head}*`);
  lines.push(`נכון ל: ${asOf}`);
  lines.push("");

  const withSpend = campaigns.filter((c) => c.spend > 0);
  const toShow = withSpend.length > 0 ? withSpend : campaigns;
  let total = 0;

  for (const c of toShow) {
    total += c.spend;
    const cpr =
      c.results > 0 && c.spend > 0 ? c.spend / c.results : null;
    const cprS = cpr != null && cpr > 0 ? `${fmt(cpr)} ${currency}` : "—";
    lines.push(`*${c.name}*`);
    lines.push(
      `הוצאה: ${fmt(c.spend)} ${currency} | תוצאות: ${c.results} | עלות לתוצאה: ${cprS}`
    );
    lines.push("");
  }

  if (toShow.length === 0) {
    lines.push("לא נמצאו נתוני campaign להיום (או אין עדיין נתונים).");
    lines.push("");
  }

  lines.push(`*סה״כ הוצאה היום:* ${fmt(total)} ${currency}`);

  const body = lines.join("\n").trim();
  if (body.length > 4000) {
    return body.slice(0, 3990) + "\n…(הודעה קוצרה.)";
  }
  return body;
}

/**
 * מריץ קליטת מוביל (מוקד מכירות → זכיה + לקוחות משלמים) עבור ולדימיר רזינץ.
 *
 * דורש: FIREBASE_SERVICE_ACCOUNT_JSON, CRM_TENANTS (כולל liftygo-customers + databaseId),
 * ואופציונלי: CRM_MOVING_ORDERS_TENANT_IDS אם הטננט לא ברירת המחדל.
 *
 * שימוש:
 *   npx tsx scripts/onboard-vladimir-mover.ts
 */

import { withTenantDatabaseId } from "@/lib/server/tenantDbContext";
import { getTenantConfigs } from "@/lib/tenant/config";
import { processMoverWelcomeItems } from "@/lib/movingOrders/processMoverWelcomeItems";

function liftygoCustomersDatabaseId(): string {
  const configs = getTenantConfigs();
  const t = configs.find((c) => c.id === "liftygo-customers");
  if (!t?.databaseId?.trim()) {
    throw new Error('לא נמצא טננט id=liftygo-customers ב-CRM_TENANTS (או חסר databaseId)');
  }
  return t.databaseId.trim();
}

async function main() {
  const databaseId = liftygoCustomersDatabaseId();
  const item = {
    name: "ולדימיר רזינץ",
    phone: "0526825511",
    email: "Forward.hovalot@gmail.com",
    activity_regions:
      "גוש דן, תל אביב, רמת גן / גבעתיים, שפלה",
    activity_regions_array: ["גוש דן", "תל אביב", "רמת גן / גבעתיים", "שפלה"],
    activity_hours: "08:00-23:59",
    activity_flexible: true,
    immediate_availability: "לא",
    mover_services: "הובלות דירה, הובלות שמצריכות מנוף",
    notes: "אין הערות",
  };

  const out = await withTenantDatabaseId(databaseId, () =>
    processMoverWelcomeItems([item])
  );

  if (!out.ok) {
    console.error("נכשל:", out.error, JSON.stringify(out.results, null, 2));
    process.exit(1);
  }
  console.log("הצלחה:", JSON.stringify(out.results, null, 2));
}

void main();

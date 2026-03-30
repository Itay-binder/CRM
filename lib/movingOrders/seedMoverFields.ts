import { upsertCustomField } from "@/lib/customFields/repo";
import { PAYING_CUSTOMERS_PIPELINE_ID } from "@/lib/movingOrders/fieldIds";

const PIPE = [PAYING_CUSTOMERS_PIPELINE_ID];

/**
 * יוצר/מעדכן שדות מותאמים למובילים תחת פייפליין לקוחות משלמים.
 */
export async function seedMoverCustomFields(): Promise<{ fieldIds: string[] }> {
  const defs: Array<{
    fieldId: string;
    label: string;
    type: "boolean" | "text";
  }> = [
    { fieldId: "mover_is_mover", label: "מוביל (השתתף בהתאמת הזמנות)", type: "boolean" },
    { fieldId: "mover_regions", label: "אזורי פעילות (מופרידים בפסיק)", type: "text" },
    { fieldId: "mover_nationwide", label: "עובד בכל הארץ", type: "boolean" },
    { fieldId: "mover_days", label: "ימי פעילות (למשל: א', ב', ג', ד', ה', ו', שבת)", type: "text" },
    { fieldId: "mover_hour_start", label: "שעת פעילות התחלה", type: "text" },
    { fieldId: "mover_hour_end", label: "שעת פעילות סיום", type: "text" },
    { fieldId: "mover_flexible_hours", label: "שעות גמישות (בכל שעה ביום)", type: "boolean" },
    { fieldId: "mover_same_day", label: "זמינות להובלה מיידית מהיום להיום", type: "boolean" },
    { fieldId: "mover_crane", label: "עובד עם מנוף", type: "boolean" },
    { fieldId: "mover_large", label: "הובלה גדולה", type: "boolean" },
    { fieldId: "mover_small", label: "הובלה קטנה", type: "boolean" },
    { fieldId: "mover_apartment", label: "הובלת דירה", type: "boolean" },
  ];

  const fieldIds: string[] = [];
  for (const def of defs) {
    const r = await upsertCustomField({
      fieldId: def.fieldId,
      entityType: "contact",
      label: def.label,
      type: def.type,
      pipelineIds: PIPE,
      isRequired: false,
      isActive: true,
    });
    fieldIds.push(r.fieldId);
  }
  return { fieldIds };
}

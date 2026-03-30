import { upsertCustomField } from "@/lib/customFields/repo";
import { PAYING_CUSTOMERS_PIPELINE_ID } from "@/lib/movingOrders/fieldIds";

const PIPE = [PAYING_CUSTOMERS_PIPELINE_ID];

/**
 * שדות מותאמים להזדמנות בפייפליין לקוחות משלמים — תואמים לוובהוק שאלון הצטרפות מוביל.
 */
export async function seedMoverWelcomeOpportunityFields(): Promise<{ fieldIds: string[] }> {
  const defs: Array<{
    fieldId: string;
    label: string;
    type: "boolean" | "text" | "phone" | "email";
  }> = [
    { fieldId: "mover_welcome_full_name", label: "שאלון מוביל — שם מלא", type: "text" },
    { fieldId: "mover_welcome_phone", label: "שאלון מוביל — טלפון", type: "phone" },
    { fieldId: "mover_welcome_email", label: "שאלון מוביל — דוא״ל", type: "email" },
    { fieldId: "mover_welcome_activity_regions", label: "שאלון מוביל — אזורי פעילות (טקסט)", type: "text" },
    {
      fieldId: "mover_welcome_activity_regions_json",
      label: "שאלון מוביל — אזורי פעילות (JSON)",
      type: "text",
    },
    { fieldId: "mover_welcome_activity_days_text", label: "שאלון מוביל — ימי פעילות (טקסט)", type: "text" },
    {
      fieldId: "mover_welcome_activity_days_json",
      label: "שאלון מוביל — ימי פעילות (JSON)",
      type: "text",
    },
    { fieldId: "mover_welcome_activity_start", label: "שאלון מוביל — תחילת חלון שעות", type: "text" },
    { fieldId: "mover_welcome_activity_end", label: "שאלון מוביל — סוף חלון שעות", type: "text" },
    { fieldId: "mover_welcome_activity_flexible", label: "שאלון מוביל — שעות גמישות", type: "boolean" },
    { fieldId: "mover_welcome_activity_hours", label: "שאלון מוביל — שעות פעילות (טקסט חופשי)", type: "text" },
    {
      fieldId: "mover_welcome_immediate_availability",
      label: "שאלון מוביל — זמינות מיידית",
      type: "text",
    },
    { fieldId: "mover_welcome_mover_services", label: "שאלון מוביל — שירותי הובלה", type: "text" },
    { fieldId: "mover_welcome_notes", label: "שאלון מוביל — הערות", type: "text" },
  ];

  const fieldIds: string[] = [];
  for (const def of defs) {
    const r = await upsertCustomField({
      fieldId: def.fieldId,
      entityType: "opportunity",
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

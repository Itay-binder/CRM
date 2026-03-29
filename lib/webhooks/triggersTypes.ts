/** טיפים ותוויות — בלי firebase-admin (בטוח ל-client). */

export type WebhookEventId =
  | "task_reminder_custom"
  | "task_reminder_deadline_15m"
  | "lead_created"
  | "lead_stage_changed"
  | "opportunity_created"
  | "opportunity_stage_changed"
  | "opportunity_pipeline_changed";

export type WebhookTriggerRow = {
  id: string;
  label: string;
  event: WebhookEventId;
  enabled: boolean;
  url: string;
};

export const WEBHOOK_EVENT_LABELS: Record<WebhookEventId, string> = {
  task_reminder_custom: "תזכורת משימה (תאריך תזכורת)",
  task_reminder_deadline_15m: "15 דק׳ לפני דדליין משימה",
  lead_created: "ליד / איש קשר נקלט במערכת",
  lead_stage_changed: "שינוי שלב איש קשר (פייפליין לידים)",
  opportunity_created: "הזדמנות חדשה נוצרה",
  opportunity_stage_changed: "שינוי שלב בהזדמנות",
  opportunity_pipeline_changed: "הזדמנות הועברה לפייפליין אחר",
};

export const ALL_WEBHOOK_EVENTS: WebhookEventId[] = [
  "task_reminder_custom",
  "task_reminder_deadline_15m",
  "lead_created",
  "lead_stage_changed",
  "opportunity_created",
  "opportunity_stage_changed",
  "opportunity_pipeline_changed",
];

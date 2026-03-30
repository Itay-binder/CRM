/** פייפליין לקוחות משלמים במערכת */
export const PAYING_CUSTOMERS_PIPELINE_ID = "customers";

/**
 * שדות מותאמים להזדמנות — שאלון הצטרפות / וולקאם מוביל (אחרי upsertCustomField עם entity opportunity).
 * ערכים אלה נשמרים ב־ Firestore כ־ opportunity_...
 */
export const MOVER_WELCOME_OPPORTUNITY_FIELD_IDS = {
  fullName: "opportunity_mover_welcome_full_name",
  phone: "opportunity_mover_welcome_phone",
  email: "opportunity_mover_welcome_email",
  activityRegions: "opportunity_mover_welcome_activity_regions",
  activityRegionsJson: "opportunity_mover_welcome_activity_regions_json",
  activityDaysText: "opportunity_mover_welcome_activity_days_text",
  activityDaysJson: "opportunity_mover_welcome_activity_days_json",
  activityStart: "opportunity_mover_welcome_activity_start",
  activityEnd: "opportunity_mover_welcome_activity_end",
  activityFlexible: "opportunity_mover_welcome_activity_flexible",
  activityHours: "opportunity_mover_welcome_activity_hours",
  immediateAvailability: "opportunity_mover_welcome_immediate_availability",
  moverServices: "opportunity_mover_welcome_mover_services",
  notes: "opportunity_mover_welcome_notes",
} as const;

/** שדות מותאמים לאנשי קשר — מובילים */
export const MOVER_FIELD_IDS = {
  isMover: "contact_mover_is_mover",
  regions: "contact_mover_regions",
  nationwide: "contact_mover_nationwide",
  days: "contact_mover_days",
  hourStart: "contact_mover_hour_start",
  hourEnd: "contact_mover_hour_end",
  flexibleHours: "contact_mover_flexible_hours",
  sameDay: "contact_mover_same_day",
  crane: "contact_mover_crane",
  large: "contact_mover_large",
  small: "contact_mover_small",
  apartment: "contact_mover_apartment",
} as const;

/** כל מזהי השדות ב־Firestore (למיזוג אחרי validate ולוידוא קליטה) */
export const MOVER_CONTACT_FIELD_IDS: string[] = Object.values(MOVER_FIELD_IDS);

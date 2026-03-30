/** פייפליין לקוחות משלמים במערכת */
export const PAYING_CUSTOMERS_PIPELINE_ID = "customers";

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

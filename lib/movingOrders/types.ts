export type MovingOrderStatus = "pending" | "dispatched" | "completed" | "cancelled";

/** גוף הזמנה כפי שנכנס מ-webhook חיצוני */
export type MovingOrderPayload = {
  order_id: string;
  move_type?: string;
  pickup?: string;
  dropoff?: string;
  date?: string;
  is_urgent?: string;
  crane_info?: string;
  needs_crane?: string;
  name?: string;
  phone?: string;
  notes?: string;
  what_moving?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  event_id?: string;
  fbp?: string;
  fbc?: string;
  fbclid?: string;
  pickup_type?: string;
  pickup_floor?: string;
  pickup_access?: string;
  drop_type?: string;
  drop_floor?: string;
  drop_access?: string;
  cartons?: string;
  items_list?: string;
  items_text?: string;
  drive_folder_url?: string;
  drive_folder_id?: string;
  drive_folder_name?: string;
  drive_files_count?: number;
};

export type MovingOrderRecord = {
  id: string;
  orderId: string;
  status: MovingOrderStatus;
  payload: MovingOrderPayload;
  /** מובילים שעומדים בכל התנאים */
  matchedDriverIds: string[];
  /** אזור בלבד — לא עומדים בשאר */
  optionalDriverIds: string[];
  /** נוספו ידנית מהממשק */
  manualDriverIds: string[];
  /** מזהי מובילים שהמשתמש ביטל מהבחירה (ברירת מחדל: כולם מסומנים) */
  excludedDriverIds: string[];
  dispatchedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type DriverSummary = {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
};

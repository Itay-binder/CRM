import type { MovingOrderPayload } from "@/lib/movingOrders/types";

const KEYS: (keyof MovingOrderPayload)[] = [
  "order_id",
  "move_type",
  "pickup",
  "dropoff",
  "pickup_city",
  "dropoff_city",
  "day_order",
  "date",
  "is_urgent",
  "crane_info",
  "needs_crane",
  "name",
  "phone",
  "notes",
  "what_moving",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "event_id",
  "fbp",
  "fbc",
  "fbclid",
  "pickup_type",
  "pickup_floor",
  "pickup_access",
  "drop_type",
  "drop_floor",
  "drop_access",
  "items_text",
  "cartons",
  "drive_folder_url",
  "drive_folder_id",
  "drive_folder_name",
];

function pickStr(body: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = body[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

/** נרמול גוף webhook: items_list כמערך → מחרוזת JSON בשדה items_list בפיילואד */
export function normalizePayloadForStorage(body: Record<string, unknown>): MovingOrderPayload {
  const rawItems = body.items_list;
  let items_list: string | undefined;
  if (Array.isArray(rawItems)) {
    items_list = JSON.stringify(rawItems);
  } else if (typeof rawItems === "string") {
    items_list = rawItems;
  }

  const driveCount = body.drive_files_count;
  const drive_files_count =
    typeof driveCount === "number"
      ? driveCount
      : typeof driveCount === "string"
        ? Number.parseInt(driveCount, 10)
        : undefined;

  const base = body as unknown as MovingOrderPayload;
  const pickup_city = pickStr(body, "pickup_city", "moving_order_pickup_city") ?? base.pickup_city;
  const dropoff_city = pickStr(body, "dropoff_city", "moving_order_dropoff_city") ?? base.dropoff_city;
  const day_order = pickStr(body, "day_order", "moving_order_day_order") ?? base.day_order;
  return {
    ...base,
    ...(items_list !== undefined ? { items_list } : {}),
    ...(Number.isFinite(drive_files_count) ? { drive_files_count } : {}),
    ...(pickup_city ? { pickup_city } : {}),
    ...(dropoff_city ? { dropoff_city } : {}),
    ...(day_order ? { day_order } : {}),
  };
}

export function rawCustomValuesFromPayload(payload: MovingOrderPayload): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of KEYS) {
    const v = payload[k];
    if (v === undefined || v === null) continue;
    out[`moving_order_${k}`] = typeof v === "object" ? JSON.stringify(v) : v;
  }
  if (payload.items_list !== undefined && payload.items_list !== "") {
    out.moving_order_items_list =
      typeof payload.items_list === "string"
        ? payload.items_list
        : JSON.stringify(payload.items_list);
  }
  if (typeof payload.drive_files_count === "number" && Number.isFinite(payload.drive_files_count)) {
    out.moving_order_drive_files_count = payload.drive_files_count;
  }
  return out;
}

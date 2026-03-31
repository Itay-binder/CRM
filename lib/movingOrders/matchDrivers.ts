import type { LeadRecord } from "@/lib/leads/repo";
import { extractCityHints } from "@/lib/movingOrders/israelCities";
import { MOVER_FIELD_IDS } from "@/lib/movingOrders/fieldIds";
import { leadIsPayingPipelineMoverCandidate } from "@/lib/movingOrders/moverFieldReaders";
import type { MovingOrderPayload } from "@/lib/movingOrders/types";

function readBool(cf: Record<string, unknown> | undefined, key: string): boolean {
  const v = cf?.[key];
  if (v === true) return true;
  if (v === false) return false;
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  return s === "true" || s === "1" || s === "כן" || s === "yes";
}

function readStr(cf: Record<string, unknown> | undefined, key: string): string {
  return String(cf?.[key] ?? "").trim();
}

function jerusalemWeekdayIndex(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00+03:00`);
  const wd = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "Asia/Jerusalem" });
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const idx = map[wd];
  return idx === undefined ? null : idx;
}

/** סימנים לחיפוש בשדה ימי הפעילות של המוביל (א׳–ש׳) */
export function orderDateToJerusalemWeekdayMarkers(ymd: string): string[] {
  const dow = jerusalemWeekdayIndex(ymd);
  if (dow === null) return [];
  const map: Record<number, string[]> = {
    0: ["א", "א׳", "ראשון", "יום א", "יום ראשון"],
    1: ["ב", "ב׳", "שני", "יום ב", "יום שני"],
    2: ["ג", "ג׳", "שלישי", "יום ג", "יום שלישי"],
    3: ["ד", "ד׳", "רביעי", "יום ד", "יום רביעי"],
    4: ["ה", "ה׳", "חמישי", "יום ה", "יום חמישי"],
    5: ["ו", "ו׳", "שישי", "יום ו", "יום שישי"],
    6: ["שבת", "ש׳", "שבת.", "יום שבת"],
  };
  return map[dow] ?? [];
}

export type OrderCapabilityFlags = {
  needsApartment: boolean;
  needsSmall: boolean;
  needsLarge: boolean;
  needsCrane: boolean;
  needsSameDay: boolean;
};

export function deriveOrderCapabilities(order: MovingOrderPayload): OrderCapabilityFlags {
  const mt = order.move_type ?? "";
  const il = order.items_list ?? "";
  const iu = order.is_urgent ?? "";
  const nc = String(order.needs_crane ?? "").trim();
  const ci = order.crane_info ?? "";

  const needsApartment = /דירה/.test(mt);
  const needsSmall = /קטנ|קטנה|מיני|פריטים|קרטונים/i.test(`${mt} ${il}`);
  const needsLarge = /דירה|משרד|פנט|גדול/i.test(`${mt} ${il}`) || needsApartment;
  const needsCrane =
    /^(כן|yes|true|1)$/i.test(nc) || /צריך|נדרש|כן/.test(ci) || /כן/.test(nc);
  const needsSameDay = /דחוף|מיידי|sos|היום|מהיום|היום ל/i.test(`${iu} ${mt}`);

  return {
    needsApartment,
    needsSmall,
    needsLarge,
    needsCrane,
    needsSameDay,
  };
}

export function driverWorksOnDay(daysStr: string, markers: string[]): boolean {
  const d = daysStr.trim().toLowerCase();
  if (!d) return false;
  for (const marker of markers) {
    const m = marker.trim().toLowerCase();
    if (!m) continue;
    if (d.includes(m)) return true;
    const collapsed = m.replace(/['׳"]/g, "");
    if (collapsed.length >= 1 && d.includes(collapsed)) return true;
  }
  return false;
}

/** מפתח לטבלת יישוב→אזור (זהה לנרמול טקסט באזורי מוביל) */
function normSettlementLookupKey(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\u0591-\u05C7]/g, "")
    .toLowerCase();
}

function expandRegionCandidates(
  cityHints: string[],
  settlementRegionMap: Map<string, string> | undefined
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    const k = normHe(t);
    if (k.length < 2 || seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };
  for (const hint of cityHints) {
    add(hint);
    const reg = settlementRegionMap?.get(normSettlementLookupKey(hint));
    if (reg) add(reg);
  }
  return out;
}

function regionMatch(lead: LeadRecord, regionCandidates: string[]): boolean {
  if (readBool(lead.customFields, MOVER_FIELD_IDS.nationwide)) return true;
  const regions = readStr(lead.customFields, MOVER_FIELD_IDS.regions);
  if (!regions) return false;
  const nr = normHe(regions);
  for (const cand of regionCandidates) {
    const c = normHe(cand);
    if (c.length >= 2 && nr.includes(c)) return true;
  }
  return false;
}

function normHe(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\u0591-\u05C7]/g, "")
    .toLowerCase();
}

function capabilityMatch(lead: LeadRecord, caps: OrderCapabilityFlags): boolean {
  const cf = lead.customFields;
  if (caps.needsApartment && !readBool(cf, MOVER_FIELD_IDS.apartment)) return false;
  if (caps.needsCrane && !readBool(cf, MOVER_FIELD_IDS.crane)) return false;
  if (caps.needsSameDay && !readBool(cf, MOVER_FIELD_IDS.sameDay)) return false;
  if (caps.needsSmall && !readBool(cf, MOVER_FIELD_IDS.small)) return false;
  if (caps.needsLarge && !readBool(cf, MOVER_FIELD_IDS.large)) return false;
  return true;
}

function dayMatch(lead: LeadRecord, orderDate: string | undefined): boolean {
  if (!orderDate?.trim()) return true;
  const markers = orderDateToJerusalemWeekdayMarkers(orderDate);
  if (markers.length === 0) return true;
  const daysStr = readStr(lead.customFields, MOVER_FIELD_IDS.days);
  if (!daysStr) return false;
  return driverWorksOnDay(daysStr, markers);
}

export type MatchDriversResult = {
  matched: LeadRecord[];
  optional: LeadRecord[];
};

/**
 * מסנן אנשי קשר בפייפליין לקוחות משלמים שמסומנים כמובילים.
 */
export function matchDriversForOrder(
  leads: LeadRecord[],
  order: MovingOrderPayload,
  settlementRegionMap?: Map<string, string>
): MatchDriversResult {
  const cityHints = extractCityHints(order.pickup ?? "", order.dropoff ?? "");
  const regionCandidates = expandRegionCandidates(cityHints, settlementRegionMap);
  const caps = deriveOrderCapabilities(order);
  const orderDate = order.date?.trim();

  const movers = leads.filter(leadIsPayingPipelineMoverCandidate);

  const matched: LeadRecord[] = [];
  const optional: LeadRecord[] = [];

  for (const lead of movers) {
    const areaOk = regionMatch(lead, regionCandidates);
    if (!areaOk) continue;

    const dayOk = dayMatch(lead, orderDate);
    const capOk = capabilityMatch(lead, caps);

    if (dayOk && capOk) matched.push(lead);
    else optional.push(lead);
  }

  const matchedIds = new Set(matched.map((m) => m.id));
  const optionalOnly = optional.filter((o) => !matchedIds.has(o.id));

  return { matched, optional: optionalOnly };
}

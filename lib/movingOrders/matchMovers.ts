import type { LeadRecord } from "@/lib/leads/repo";
import type { OpportunityRecord } from "@/lib/opportunities/repo";
import { extractCityHints } from "@/lib/movingOrders/israelCities";
import { deriveOrderCapabilities, driverWorksOnDay, orderDateToJerusalemWeekdayMarkers } from "@/lib/movingOrders/matchDrivers";
import { MOVER_FIELD_IDS, MOVER_OPPORTUNITY_FIELD_IDS, PAYING_CUSTOMERS_PIPELINE_ID } from "@/lib/movingOrders/fieldIds";
import type { DriverMatchFlag, MovingOrderPayload } from "@/lib/movingOrders/types";
import {
  mergeLeadAndOpportunity,
  moverIsNationwide,
  normHe,
  normSettlementLookupKey,
  readActivityDaysText,
  readApartmentMoverAnswer,
  readImmediateSos,
  readMoverRegionsText,
  readSmallMoverAnswer,
  readStrFirst,
} from "@/lib/movingOrders/moverFieldReaders";

function readBool(cf: Record<string, unknown> | undefined, key: string): boolean {
  const v = cf?.[key];
  if (v === true) return true;
  if (v === false) return false;
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  return s === "true" || s === "1" || s === "כן" || s === "yes";
}

function combineFlags(a: DriverMatchFlag, b: DriverMatchFlag): DriverMatchFlag {
  if (a === "red" || b === "red") return "red";
  if (a === "orange" || b === "orange") return "orange";
  return "ok";
}

function flagRank(f: DriverMatchFlag): number {
  if (f === "ok") return 0;
  if (f === "orange") return 1;
  return 2;
}

export function opportunitiesByContactId(opps: OpportunityRecord[]): Map<string, OpportunityRecord> {
  const m = new Map<string, OpportunityRecord>();
  for (const o of opps) {
    const cid = (o.contactId ?? "").trim();
    if (!cid) continue;
    const prev = m.get(cid);
    if (!prev) {
      m.set(cid, o);
      continue;
    }
    const ta = prev.updatedAt?.getTime() ?? 0;
    const tb = o.updatedAt?.getTime() ?? 0;
    if (tb >= ta) m.set(cid, o);
  }
  return m;
}

function normCity(s: string): string {
  return normHe(s);
}

function cityIsRamatGanOrGiva(c: string): boolean {
  const n = normCity(c);
  if (!n) return false;
  return n === normCity("רמת גן") || n === normCity("גבעתיים");
}

function cityIsTlv(c: string): boolean {
  const n = normCity(c);
  if (!n) return false;
  return (
    n === normCity("תל אביב-יפו") ||
    n === normCity("תל אביב") ||
    (n.includes("תל") && n.includes("אביב"))
  );
}

function buildRegionRuleGroups(
  pickupCity: string,
  dropCity: string,
  settlementRegionMap: Map<string, string>
): string[][] {
  const cities = [pickupCity, dropCity].filter((x) => x.trim());
  const hasRG = cities.some(cityIsRamatGanOrGiva);
  const hasTLV = cities.some(cityIsTlv);
  const groups: string[][] = [];
  if (hasRG) groups.push(["רמת גן / גבעתיים", "גוש דן", "כל הארץ"]);
  if (hasTLV) groups.push(["תל אביב", "גוש דן", "כל הארץ"]);
  if (groups.length === 0) {
    const regs = new Set<string>();
    for (const c of cities) {
      const r = settlementRegionMap.get(normSettlementLookupKey(c));
      if (r?.trim()) regs.add(r.trim());
      else if (c.trim()) regs.add(c.trim());
    }
    groups.push(Array.from(regs));
  }
  return groups;
}

function moverMatchesRegionTokens(
  moverNorm: string,
  tokens: string[],
  nationwide: boolean
): boolean {
  if (nationwide) return true;
  if (tokens.length === 0) return false;
  for (const t of tokens) {
    const nt = normHe(t);
    if (nt.length >= 2 && moverNorm.includes(nt)) return true;
  }
  return false;
}

function moverPassesAllRegionGroups(
  moverNorm: string,
  groups: string[][],
  nationwide: boolean
): boolean {
  for (const g of groups) {
    if (!moverMatchesRegionTokens(moverNorm, g, nationwide)) return false;
  }
  return true;
}

function hebrewDayLabelToMarkers(label: string): string[] {
  const t = label.trim().replace(/['׳"]/g, "");
  const first = t.charAt(0);
  const map: Record<string, string[]> = {
    א: ["א", "א׳", "ראשון", "יום א", "יום ראשון"],
    ב: ["ב", "ב׳", "שני", "יום ב", "יום שני"],
    ג: ["ג", "ג׳", "שלישי", "יום ג", "יום שלישי"],
    ד: ["ד", "ד׳", "רביעי", "יום ד", "יום רביעי"],
    ה: ["ה", "ה׳", "חמישי", "יום ה", "יום חמישי"],
    ו: ["ו", "ו׳", "שישי", "יום ו", "יום שישי"],
    ש: ["שבת", "ש׳", "שבת.", "יום שבת"],
  };
  return map[first] ?? [];
}

export function dayMarkersFromOrder(
  cv: Record<string, unknown> | undefined,
  payload: MovingOrderPayload
): string[] {
  const label = String(cv?.moving_order_day_order ?? payload.day_order ?? "").trim();
  if (label) {
    const m = hebrewDayLabelToMarkers(label);
    if (m.length) return m;
  }
  const date = String(cv?.moving_order_date ?? payload.date ?? "").trim();
  return orderDateToJerusalemWeekdayMarkers(date);
}

export function resolveOrderCities(
  payload: MovingOrderPayload,
  cv: Record<string, unknown> | undefined
): { pickupCity: string; dropCity: string } {
  let pickupCity = String(cv?.moving_order_pickup_city ?? payload.pickup_city ?? "").trim();
  let dropCity = String(cv?.moving_order_dropoff_city ?? payload.dropoff_city ?? "").trim();
  const hints = extractCityHints(payload.pickup ?? "", payload.dropoff ?? "");
  if (!pickupCity && hints[0]) pickupCity = hints[0];
  if (!dropCity) dropCity = hints[1] ?? hints[0] ?? "";
  return { pickupCity, dropCity };
}

function resolveMoveKind(
  payload: MovingOrderPayload,
  cv: Record<string, unknown> | undefined
): "small" | "large" | "unknown" {
  const mt = String(cv?.moving_order_move_type ?? payload.move_type ?? "").trim();
  if (/בקטנה|קטנה/i.test(mt)) return "small";
  if (/גדולה|דירה/i.test(mt)) return "large";
  const caps = deriveOrderCapabilities(payload);
  if (caps.needsSmall && !caps.needsApartment) return "small";
  if (caps.needsApartment || caps.needsLarge) return "large";
  return "unknown";
}

function orderIsUrgent(payload: MovingOrderPayload, cv: Record<string, unknown> | undefined): boolean {
  const u = String(cv?.moving_order_is_urgent ?? payload.is_urgent ?? "")
    .trim()
    .toLowerCase();
  return u === "כן" || u === "yes" || u === "true" || u === "1";
}

function workAvailabilityOk(merged: Record<string, unknown> | undefined): boolean {
  const v = readStrFirst(merged, [MOVER_OPPORTUNITY_FIELD_IDS.workAvailabilityStatus]);
  return normHe(v) === normHe("כן");
}

export type MatchMoversDetailedResult = {
  matchedDriverIds: string[];
  optionalDriverIds: string[];
  driverMatchFlags: Record<string, DriverMatchFlag>;
};

/**
 * התאמת מובילים: סינון אזור חובה, שאר הקריטריונים מסומנים כתום/אדום yet נשארים ברשימה.
 */
export function matchMoversForOrderDetailed(
  leads: LeadRecord[],
  opportunities: OpportunityRecord[],
  payload: MovingOrderPayload,
  orderCustomValues: Record<string, unknown> | undefined,
  settlementRegionMap: Map<string, string>,
  manualContactIds: Set<string>
): MatchMoversDetailedResult {
  const cv = orderCustomValues;
  const oppByContact = opportunitiesByContactId(
    opportunities.filter((o) => (o.pipelineId ?? "").trim() === PAYING_CUSTOMERS_PIPELINE_ID)
  );

  const { pickupCity, dropCity } = resolveOrderCities(payload, cv);
  const regionGroups = buildRegionRuleGroups(pickupCity, dropCity, settlementRegionMap);
  const moveKind = resolveMoveKind(payload, cv);
  const urgent = orderIsUrgent(payload, cv);
  const dayMarkers = dayMarkersFromOrder(cv, payload);

  const movers = leads.filter(
    (l) =>
      (l.pipelineId ?? "").trim() === PAYING_CUSTOMERS_PIPELINE_ID &&
      readBool(l.customFields, MOVER_FIELD_IDS.isMover)
  );

  const rows: Array<{ id: string; flag: DriverMatchFlag; name: string }> = [];

  for (const lead of movers) {
    const opp = oppByContact.get(lead.id);
    const merged = mergeLeadAndOpportunity(lead, opp);
    const regionsText = readMoverRegionsText(merged);
    const nationwide = moverIsNationwide(merged, regionsText);
    const moverNorm = normHe(regionsText);

    const manual = manualContactIds.has(lead.id);
    const regionOk = manual || moverPassesAllRegionGroups(moverNorm, regionGroups, nationwide);
    if (!regionOk) continue;

    let flag: DriverMatchFlag = "ok";

    if (!workAvailabilityOk(merged)) {
      flag = combineFlags(flag, "red");
    }

    if (moveKind === "small" && normHe(readSmallMoverAnswer(merged)) === normHe("לא")) {
      flag = combineFlags(flag, "orange");
    }
    if (moveKind === "large" && normHe(readApartmentMoverAnswer(merged)) === normHe("לא")) {
      flag = combineFlags(flag, "orange");
    }

    if (moveKind === "unknown") {
      /* לא מסמנים כתום לפי סוג — חסר מידע */
    }

    if (urgent && normHe(readImmediateSos(merged)) !== normHe("כן")) {
      flag = combineFlags(flag, "orange");
    }

    if (dayMarkers.length > 0) {
      const daysStr = readActivityDaysText(merged);
      if (!driverWorksOnDay(daysStr, dayMarkers)) {
        flag = combineFlags(flag, "orange");
      }
    }

    rows.push({
      id: lead.id,
      flag,
      name: (lead.name ?? "").trim(),
    });
  }

  rows.sort((a, b) => {
    const d = flagRank(a.flag) - flagRank(b.flag);
    if (d !== 0) return d;
    return (a.name || a.id).localeCompare(b.name || b.id, "he");
  });

  const matchedDriverIds = rows.map((r) => r.id);
  const driverMatchFlags: Record<string, DriverMatchFlag> = {};
  for (const r of rows) driverMatchFlags[r.id] = r.flag;

  return {
    matchedDriverIds,
    optionalDriverIds: [],
    driverMatchFlags,
  };
}

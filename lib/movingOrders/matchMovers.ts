import type { LeadRecord } from "@/lib/leads/repo";
import type { OpportunityRecord } from "@/lib/opportunities/repo";
import { extractCityHints } from "@/lib/movingOrders/israelCities";
import { deriveOrderCapabilities, driverWorksOnDay, orderDateToJerusalemWeekdayMarkers } from "@/lib/movingOrders/matchDrivers";
import { MOVER_OPPORTUNITY_FIELD_IDS } from "@/lib/movingOrders/fieldIds";
import type { DriverMatchFlag, MovingOrderPayload } from "@/lib/movingOrders/types";
import {
  immediateSosIndicatesYes,
  leadIsPayingPipelineMoverCandidate,
  mergeLeadAndOpportunity,
  moverIsNationwide,
  normHe,
  normSettlementLookupKey,
  readActivityDaysText,
  readApartmentMoverAnswer,
  readFirstTruthyField,
  readMoverRegionsText,
  readSmallMoverAnswer,
  triStateYesNo,
} from "@/lib/movingOrders/moverFieldReaders";

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
  if (hasRG) {
    groups.push([
      "רמת גן / גבעתיים",
      "רמת גן",
      "גבעתיים",
      "גוש דן",
      "כל הארץ",
    ]);
  }
  if (hasTLV) {
    groups.push([
      "תל אביב",
      "תל אביב-יפו",
      "תל אביב יפו",
      "גוש דן",
      "כל הארץ",
    ]);
  }
  if (groups.length === 0) {
    const regs = new Set<string>();
    for (const c of cities) {
      const r = settlementRegionMap.get(normSettlementLookupKey(c));
      if (r?.trim()) regs.add(r.trim());
      else if (c.trim()) regs.add(c.trim());
    }
    const arr = Array.from(regs).filter((x) => x.trim());
    if (arr.length) groups.push(arr);
  }
  return groups;
}

/**
 * כשמספר כללי עיר חלים (למשל רמת גן + תל אביב), AND בין קבוצות מתפסק מובילים עם «תל אביב» בלבד.
 * במקרה המטרופוליני מאחדים לאיחוד טוקנים — מספיק התאמה לאחד מהם (כמו קבוצה אחת).
 */
function coalesceMetroRegionGroups(groups: string[][]): string[][] {
  if (groups.length <= 1) return groups;
  const seen = new Set<string>();
  const union: string[] = [];
  for (const g of groups) {
    for (const t of g) {
      const nk = normHe(t);
      if (nk.length < 2) continue;
      if (seen.has(nk)) continue;
      seen.add(nk);
      union.push(t);
    }
  }
  return union.length ? [union] : groups;
}

function normHeNoSpaces(s: string): string {
  return normHe(s).replace(/\s+/g, "");
}

function moverMatchesRegionTokens(
  moverNorm: string,
  tokens: string[],
  nationwide: boolean
): boolean {
  if (nationwide) return true;
  if (tokens.length === 0) return false;
  const moverCollapsed = normHeNoSpaces(moverNorm);
  for (const t of tokens) {
    const nt = normHe(t);
    if (nt.length >= 2 && moverNorm.includes(nt)) return true;
    const ntCol = normHeNoSpaces(t);
    if (ntCol.length >= 2 && moverCollapsed.includes(ntCol)) return true;
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
  const pickupLine = (payload.pickup ?? "").trim();
  const dropLine = (payload.dropoff ?? "").trim();

  if (!pickupCity && pickupLine) {
    const fromPickup = extractCityHints(pickupLine, "");
    if (fromPickup[0]) pickupCity = fromPickup[0];
  }
  if (!dropCity && dropLine) {
    const fromDrop = extractCityHints(dropLine, "");
    if (fromDrop[0]) dropCity = fromDrop[0];
  }

  const hints = extractCityHints(pickupLine, dropLine);
  if (!pickupCity && hints[0]) pickupCity = hints[0];
  if (!dropCity) dropCity = hints[1] ?? hints[0] ?? "";

  return { pickupCity, dropCity };
}

function resolveMoveKind(
  payload: MovingOrderPayload,
  cv: Record<string, unknown> | undefined
): "small" | "large" | "unknown" {
  const mt = String(cv?.moving_order_move_type ?? payload.move_type ?? "").trim();
  if (/הובל[הת]\s*קטנ|הובלה\s*קטנה|בקטנה|קטנה(?!\s*דיר)/i.test(mt)) return "small";
  if (/הובל[הת]\s*דיר|הובלת\s*דירה|הובלה\s*דירתית|גדולה/i.test(mt)) return "large";
  const caps = deriveOrderCapabilities(payload);
  if (caps.needsSmall && !caps.needsApartment) return "small";
  if (caps.needsApartment || caps.needsLarge) return "large";
  return "unknown";
}

function orderIsUrgent(payload: MovingOrderPayload, cv: Record<string, unknown> | undefined): boolean {
  const raw = cv?.moving_order_is_urgent ?? payload.is_urgent;
  if (triStateYesNo(raw) === true) return true;
  const u = String(raw ?? "")
    .trim()
    .toLowerCase();
  return u === "כן" || u === "yes" || u === "true" || u === "1";
}

/** רק ערך שלילי מפורש נחשב לא זמין; חסר / לא מזוהה — לא מסמנים אדום */
function workAvailabilityOk(merged: Record<string, unknown> | undefined): boolean {
  const raw = readFirstTruthyField(merged, [MOVER_OPPORTUNITY_FIELD_IDS.workAvailabilityStatus]);
  return triStateYesNo(raw) !== false;
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
  payingPipelineId: string,
  leads: LeadRecord[],
  opportunities: OpportunityRecord[],
  payload: MovingOrderPayload,
  orderCustomValues: Record<string, unknown> | undefined,
  settlementRegionMap: Map<string, string>,
  manualContactIds: Set<string>
): MatchMoversDetailedResult {
  const pipe = payingPipelineId.trim();
  const cv = orderCustomValues;
  const oppByContact = opportunitiesByContactId(
    opportunities.filter((o) => (o.pipelineId ?? "").trim() === pipe)
  );

  const { pickupCity, dropCity } = resolveOrderCities(payload, cv);
  const regionGroups = coalesceMetroRegionGroups(
    buildRegionRuleGroups(pickupCity, dropCity, settlementRegionMap)
  );
  const moveKind = resolveMoveKind(payload, cv);
  const urgent = orderIsUrgent(payload, cv);
  const dayMarkers = dayMarkersFromOrder(cv, payload);

  const movers = leads.filter((l) => leadIsPayingPipelineMoverCandidate(l, pipe));

  const rows: Array<{ id: string; flag: DriverMatchFlag; name: string }> = [];

  for (const lead of movers) {
    const opp = oppByContact.get(lead.id);
    const merged = mergeLeadAndOpportunity(lead, opp);
    const regionsText = readMoverRegionsText(merged);
    const nationwide = moverIsNationwide(merged, regionsText);
    const moverNorm = normHe(regionsText);
    const hasRegionRequirement = regionGroups.some((g) => g.length > 0);
    const regionsDataMissing =
      !nationwide && !regionsText.trim() && hasRegionRequirement;

    const manual = manualContactIds.has(lead.id);
    const regionStrictOk = moverPassesAllRegionGroups(moverNorm, regionGroups, nationwide);
    const regionOk = manual || regionStrictOk || regionsDataMissing;
    if (!regionOk) continue;

    let flag: DriverMatchFlag = "ok";

    if (regionsDataMissing && !manual) {
      flag = combineFlags(flag, "orange");
    }

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

    if (urgent && !immediateSosIndicatesYes(merged)) {
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

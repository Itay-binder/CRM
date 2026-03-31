import type { LeadRecord } from "@/lib/leads/repo";
import type { OpportunityRecord } from "@/lib/opportunities/repo";
import {
  MOVER_FIELD_IDS,
  MOVER_OPPORTUNITY_FIELD_IDS,
  MOVER_WELCOME_OPPORTUNITY_FIELD_IDS,
  PAYING_CUSTOMERS_PIPELINE_ID,
} from "@/lib/movingOrders/fieldIds";

export function normHe(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\u0591-\u05C7]/g, "")
    .toLowerCase();
}

/** מפתח לטבלת יישוב→אזור */
export function normSettlementLookupKey(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\u0591-\u05C7]/g, "")
    .toLowerCase();
}

export function readBoolYes(cf: Record<string, unknown> | undefined, keys: string[]): boolean {
  if (!cf) return false;
  for (const key of keys) {
    const v = cf[key];
    if (v === true) return true;
    if (v === false) continue;
    const s = String(v ?? "")
      .trim()
      .toLowerCase();
    if (s === "true" || s === "1" || s === "כן" || s === "yes") return true;
  }
  return false;
}

export function readStrFirst(cf: Record<string, unknown> | undefined, keys: string[]): string {
  if (!cf) return "";
  for (const key of keys) {
    const v = cf[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Array.isArray(v) && v.length) return v.map((x) => String(x).trim()).filter(Boolean).join(", ");
  }
  return "";
}

function tryParseRegionsJson(raw: string): string {
  try {
    const j = JSON.parse(raw) as unknown;
    if (Array.isArray(j)) return j.map((x) => String(x).trim()).filter(Boolean).join(", ");
    if (j && typeof j === "object" && "regions" in j) {
      const r = (j as { regions?: unknown }).regions;
      if (Array.isArray(r)) return r.map((x) => String(x).trim()).filter(Boolean).join(", ");
    }
  } catch {
    /* ignore */
  }
  return "";
}

/** טקסט אזורי פעילות — איחוד הזדמנות + איש קשר */
export function readMoverRegionsText(
  merged: Record<string, unknown> | undefined
): string {
  if (!merged) return "";
  const direct = readStrFirst(merged, [
    MOVER_OPPORTUNITY_FIELD_IDS.activityRegions,
    MOVER_WELCOME_OPPORTUNITY_FIELD_IDS.activityRegions,
    MOVER_FIELD_IDS.regions,
  ]);
  if (direct) return direct;
  const jsonRaw = merged[MOVER_WELCOME_OPPORTUNITY_FIELD_IDS.activityRegionsJson];
  if (typeof jsonRaw === "string" && jsonRaw.trim()) {
    const parsed = tryParseRegionsJson(jsonRaw);
    if (parsed) return parsed;
  }
  return "";
}

export function moverIsNationwide(merged: Record<string, unknown> | undefined, regionsText: string): boolean {
  if (readBoolYes(merged, [MOVER_FIELD_IDS.nationwide])) return true;
  const nr = normHe(regionsText);
  return nr.includes(normHe("כל הארץ"));
}

/**
 * איש קשר בפייפליין לקוחות משלמים שאינו מסומן במפורש כלא־מוביל.
 * (ברירת מחדל: כל אנשי הקשר בפייפליין הזה נחשבים מועמדים, עד שמסמנים «לא».)
 */
export function leadIsPayingPipelineMoverCandidate(lead: LeadRecord): boolean {
  if ((lead.pipelineId ?? "").trim() !== PAYING_CUSTOMERS_PIPELINE_ID) return false;
  const v = lead.customFields?.[MOVER_FIELD_IDS.isMover];
  if (v === false) return false;
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "לא" || s === "false" || s === "0" || s === "no") return false;
  return true;
}

export function mergeLeadAndOpportunity(
  lead: LeadRecord,
  opp: OpportunityRecord | undefined
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ...(lead.customFields as Record<string, unknown> | undefined),
  };
  const ov = opp?.customValues as Record<string, unknown> | undefined;
  if (!ov) return out;
  for (const [k, v] of Object.entries(ov)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && !v.trim()) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

export function readActivityDaysText(merged: Record<string, unknown> | undefined): string {
  return readStrFirst(merged, [
    MOVER_OPPORTUNITY_FIELD_IDS.activityDaysText,
    MOVER_WELCOME_OPPORTUNITY_FIELD_IDS.activityDaysText,
    MOVER_FIELD_IDS.days,
  ]);
}

export function readWorkAvailabilityDisplay(merged: Record<string, unknown> | undefined): string {
  const v = readStrFirst(merged, [MOVER_OPPORTUNITY_FIELD_IDS.workAvailabilityStatus]);
  return v || "—";
}

export function readImmediateSos(merged: Record<string, unknown> | undefined): string {
  const v = readStrFirst(merged, [
    MOVER_OPPORTUNITY_FIELD_IDS.immediateAvailability,
    MOVER_WELCOME_OPPORTUNITY_FIELD_IDS.immediateAvailability,
  ]);
  if (v) return v;
  return readBoolYes(merged, [MOVER_FIELD_IDS.sameDay]) ? "כן" : "לא";
}

export function readSmallMoverAnswer(merged: Record<string, unknown> | undefined): string {
  const o = readStrFirst(merged, [MOVER_OPPORTUNITY_FIELD_IDS.smallMover]);
  if (o) return o;
  return readBoolYes(merged, [MOVER_FIELD_IDS.small]) ? "כן" : "לא";
}

export function readApartmentMoverAnswer(merged: Record<string, unknown> | undefined): string {
  const o = readStrFirst(merged, [MOVER_OPPORTUNITY_FIELD_IDS.apartmentMover]);
  if (o) return o;
  const apt = readBoolYes(merged, [MOVER_FIELD_IDS.apartment]);
  const large = readBoolYes(merged, [MOVER_FIELD_IDS.large]);
  return apt || large ? "כן" : "לא";
}

export function readCrane(merged: Record<string, unknown> | undefined): string {
  return readBoolYes(merged, [MOVER_FIELD_IDS.crane]) ? "כן" : "לא";
}

export function readLeadsCount(merged: Record<string, unknown> | undefined): string {
  const v = merged?.[MOVER_OPPORTUNITY_FIELD_IDS.leadsCount];
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string" && v.trim()) return v.trim();
  return "0";
}

export function buildMoverEnrichment(
  lead: LeadRecord,
  opp: OpportunityRecord | undefined
): import("@/lib/movingOrders/types").MoverMatchEnrichment {
  const merged = mergeLeadAndOpportunity(lead, opp);
  const regions = readMoverRegionsText(merged);
  return {
    opportunityId: opp?.id,
    regions,
    workAvailability: readWorkAvailabilityDisplay(merged),
    activityDays: readActivityDaysText(merged),
    apartmentMover: readApartmentMoverAnswer(merged),
    smallMover: readSmallMoverAnswer(merged),
    sos: readImmediateSos(merged) || "—",
    crane: readCrane(merged),
    leadCount: readLeadsCount(merged),
    lastLeadAt: opp?.lastLeadAt ? opp.lastLeadAt.toISOString() : null,
    flexibleHours: readStrFirst(merged, [
      MOVER_WELCOME_OPPORTUNITY_FIELD_IDS.activityFlexible,
      MOVER_FIELD_IDS.flexibleHours,
    ]),
    hourStart: readStrFirst(merged, [
      MOVER_WELCOME_OPPORTUNITY_FIELD_IDS.activityStart,
      MOVER_FIELD_IDS.hourStart,
    ]),
    hourEnd: readStrFirst(merged, [
      MOVER_WELCOME_OPPORTUNITY_FIELD_IDS.activityEnd,
      MOVER_FIELD_IDS.hourEnd,
    ]),
  };
}

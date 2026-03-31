import { appendLeadNote } from "@/lib/leads/repo";
import type { LeadRecord } from "@/lib/leads/repo";
import { getPayingCustomersPipelineId, listOpportunities, updateOpportunity } from "@/lib/opportunities/repo";
import type { OpportunityRecord } from "@/lib/opportunities/repo";
import { MOVER_OPPORTUNITY_FIELD_IDS, PAYING_CUSTOMERS_PIPELINE_ID } from "@/lib/movingOrders/fieldIds";
import { opportunitiesByContactId } from "@/lib/movingOrders/matchMovers";
import { buildMoverEnrichment } from "@/lib/movingOrders/moverFieldReaders";
import type { MoverMatchEnrichment } from "@/lib/movingOrders/types";
import type { DriverMatchFlag } from "@/lib/movingOrders/types";

export type MatchWebhookMover = {
  contactId: string;
  matchFlag?: DriverMatchFlag;
  lead: {
    id: string;
    name: string;
    phone: string;
    email: string;
    stage: string;
    pipelineId: string;
    customFields?: Record<string, unknown>;
  };
  opportunity: null | {
    id: string;
    name: string;
    stage: string;
    pipelineId: string;
    contactId: string;
    customValues?: Record<string, unknown>;
    lastLeadAt: string | null;
  };
  enrichment: MoverMatchEnrichment;
};

function serializeLead(lead: LeadRecord): MatchWebhookMover["lead"] {
  return {
    id: lead.id,
    name: lead.name ?? "",
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    stage: lead.stage ?? "",
    pipelineId: lead.pipelineId ?? "",
    customFields:
      typeof lead.customFields === "object" && lead.customFields !== null
        ? (lead.customFields as Record<string, unknown>)
        : undefined,
  };
}

function serializeOpportunity(opp: OpportunityRecord): NonNullable<MatchWebhookMover["opportunity"]> {
  return {
    id: opp.id,
    name: opp.name ?? "",
    stage: opp.stage ?? "",
    pipelineId: opp.pipelineId ?? "",
    contactId: opp.contactId ?? "",
    customValues: opp.customValues,
    lastLeadAt: opp.lastLeadAt ? opp.lastLeadAt.toISOString() : null,
  };
}

export async function buildMatchWebhookMovers(
  contactIds: string[],
  flags: Record<string, DriverMatchFlag> | undefined,
  leadById: Map<string, LeadRecord>,
  oppByContact: Map<string, OpportunityRecord>
): Promise<MatchWebhookMover[]> {
  const out: MatchWebhookMover[] = [];
  for (const cid of contactIds) {
    const lead = leadById.get(cid);
    if (!lead) continue;
    const opp = oppByContact.get(cid);
    out.push({
      contactId: cid,
      matchFlag: flags?.[cid],
      lead: serializeLead(lead),
      opportunity: opp ? serializeOpportunity(opp) : null,
      enrichment: buildMoverEnrichment(lead, opp),
    });
  }
  return out;
}

export async function applyMatchSendSideEffects(params: {
  contactIds: string[];
  orderCustomerName: string;
  orderId: string;
}): Promise<void> {
  const note = `הזמנה: ${params.orderCustomerName} · מזהה הזמנה: ${params.orderId}`;
  const payingPid = await getPayingCustomersPipelineId();
  const opps = await listOpportunities(payingPid);
  const idx = opportunitiesByContactId(opps);

  for (const contactId of params.contactIds) {
    try {
      await appendLeadNote(contactId, { text: note, createdBy: "התאמת הזמנות" });
    } catch {
      /* איש קשר עלול להיות חסר — ממשיכים */
    }
    const opp = idx.get(contactId);
    if (!opp) continue;
    const cv = { ...(opp.customValues ?? {}) };
    const k = MOVER_OPPORTUNITY_FIELD_IDS.leadsCount;
    cv[k] = (Number(cv[k]) || 0) + 1;
    try {
      await updateOpportunity(opp.id, { customValues: cv });
    } catch {
      /* ignore */
    }
  }
}

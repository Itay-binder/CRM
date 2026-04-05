import type { Firestore } from "firebase-admin/firestore";
import { getLeadById } from "@/lib/leads/repo";
import { listOpportunities } from "@/lib/opportunities/repo";
import { PAYING_CUSTOMERS_PIPELINE_ID } from "@/lib/movingOrders/fieldIds";
import {
  buildMatchWebhookMovers,
  customerFacingMoversMessageText,
  flatMatchSendOpportunityFields,
  type MatchWebhookMover,
} from "@/lib/movingOrders/matchOrderActions";
import { opportunitiesByContactId } from "@/lib/movingOrders/matchMovers";
import type { MovingOrderRecord } from "@/lib/movingOrders/types";
import { displayPhoneIsraeliLocal } from "@/lib/phoneIsraeliDisplay";
import { postWebhookForEvent } from "@/lib/webhooks/dispatchServerWebhooks";

function moversWithIsraeliPhoneDisplay(movers: MatchWebhookMover[]): MatchWebhookMover[] {
  return movers.map((m) => ({
    ...m,
    lead: {
      ...m.lead,
      phone: m.lead.phone ? displayPhoneIsraeliLocal(m.lead.phone) : m.lead.phone,
    },
    opportunity: m.opportunity
      ? {
          ...m.opportunity,
          phone: m.opportunity.phone ? displayPhoneIsraeliLocal(m.opportunity.phone) : m.opportunity.phone,
        }
      : null,
  }));
}

/**
 * אותו אירוע וובהוק כמו שליחת הזמנה מלאה — עם רשימת מובילים נתונה וערך לשדה שליחת הודעה למזמין.
 */
export async function postMatchSendWebhookForDrivers(
  db: Firestore,
  order: MovingOrderRecord,
  driverIds: string[],
  notifyCustomer: boolean
): Promise<boolean> {
  if (driverIds.length === 0) return false;

  const leadById = new Map<string, NonNullable<Awaited<ReturnType<typeof getLeadById>>>>();
  await Promise.all(
    driverIds.map(async (did) => {
      const lead = await getLeadById(did);
      if (lead) leadById.set(did, lead);
    })
  );

  const opps = await listOpportunities(PAYING_CUSTOMERS_PIPELINE_ID);
  const oppByContact = opportunitiesByContactId(
    opps.filter((o) => (o.pipelineId ?? "").trim() === PAYING_CUSTOMERS_PIPELINE_ID)
  );

  const moversRaw = await buildMatchWebhookMovers(driverIds, order.driverMatchFlags, leadById, oppByContact);
  if (moversRaw.length === 0) return false;

  const movers = moversWithIsraeliPhoneDisplay(moversRaw);
  const textForCustomer = customerFacingMoversMessageText(movers);
  const notifyCustomerWebhook = notifyCustomer ? "כן" : "לא";

  return postWebhookForEvent(db, "moving_order_match_send", {
    movingOrderId: order.id,
    orderId: order.orderId,
    order: {
      payload: order.payload,
      customValues: order.customValues ?? {},
    },
    movers,
    customer_message_text: textForCustomer,
    "הודעת טקסט למזמין": textForCustomer,
    "שליחת הודעה למזמין": notifyCustomerWebhook,
    ...flatMatchSendOpportunityFields(movers),
  });
}

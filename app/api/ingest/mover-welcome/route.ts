import { NextRequest, NextResponse } from "next/server";
import { validateCustomValues } from "@/lib/customFields/repo";
import { getTenantByDatabaseId } from "@/lib/tenant/config";
import { getRequestTenantDatabaseId } from "@/lib/firebase/admin";
import { isMovingOrdersTenant } from "@/lib/tenant/movingOrders";
import { isValidIngestApiKeyAsync } from "@/lib/ingest/apiKey";
import { MOVER_CONTACT_FIELD_IDS } from "@/lib/movingOrders/fieldIds";
import { seedPayingCustomersMoverQuestionnaireFields } from "@/lib/movingOrders/seedPayingCustomersMoverQuestionnaire";
import {
  buildMoverContactCustomPatchFromWelcome,
  buildWelcomeOpportunityCustomValues,
  normalizeMoverWelcomeItems,
  type MoverWelcomeWebhookItem,
} from "@/lib/movingOrders/moverWelcomePayload";
import {
  findCustomersPipelineOpportunityByNormalizedPhone,
  getOpportunityById,
  getPayingCustomersPipelineId,
  updateOpportunity,
} from "@/lib/opportunities/repo";
import { getLeadById, updateLead } from "@/lib/leads/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

async function resolveOpportunityId(
  item: MoverWelcomeWebhookItem,
  payingPipelineId: string
): Promise<string | null> {
  const explicit = String(item.opportunity_id ?? "")
    .trim()
    .replace(/^"|"$/g, "");
  if (explicit) {
    const opp = await getOpportunityById(explicit);
    if (!opp || opp.pipelineId !== payingPipelineId) return null;
    return explicit;
  }
  const phone = String(item.phone ?? "").trim();
  if (!phone) return null;
  return findCustomersPipelineOpportunityByNormalizedPhone(phone);
}

export async function POST(req: NextRequest) {
  if (!(await isValidIngestApiKeyAsync(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" } satisfies ApiErr, { status: 401 });
  }

  const dbId = await getRequestTenantDatabaseId();
  const tenant = getTenantByDatabaseId(dbId);
  if (!tenant || !isMovingOrdersTenant(tenant.id)) {
    return NextResponse.json(
      {
        ok: false,
        error: "ניהול הזמנות לא מופעל לטננט הזה. שלח כותרת x-crm-tenant או בחר עסק מתאים.",
      } satisfies ApiErr,
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" } satisfies ApiErr, { status: 400 });
  }

  const items = normalizeMoverWelcomeItems(body);
  if (items.length === 0) {
    return NextResponse.json(
      { ok: false, error: "ציפיתי למערך אובייקטים או גוף עם items" } satisfies ApiErr,
      { status: 400 }
    );
  }

  let payingPipelineId: string;
  try {
    await seedPayingCustomersMoverQuestionnaireFields();
    payingPipelineId = await getPayingCustomersPipelineId();
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "זריעת שדות מוביל נכשלה",
      } satisfies ApiErr,
      { status: 500 }
    );
  }

  const moverFieldIdSet = new Set(MOVER_CONTACT_FIELD_IDS);

  const results: Array<{
    opportunityId: string;
    contactId?: string;
    updated: boolean;
    error?: string;
  }> = [];

  for (const item of items) {
    try {
      const oppId = await resolveOpportunityId(item, payingPipelineId);
      if (!oppId) {
        results.push({
          opportunityId: "",
          updated: false,
          error: "לא נמצאה הזדמנות בפייפליין לקוחות משלמים (טלפון או opportunity_id)",
        });
        continue;
      }

      const existing = await getOpportunityById(oppId);
      if (!existing) {
        results.push({ opportunityId: oppId, updated: false, error: "הזדמנות לא קיימת" });
        continue;
      }

      const welcomeVals = buildWelcomeOpportunityCustomValues(item);
      const mergedOppCustom = { ...(existing.customValues ?? {}), ...welcomeVals };
      const customValues = await validateCustomValues("opportunity", mergedOppCustom, {
        pipelineId: payingPipelineId,
        previousValues: existing.customValues as Record<string, unknown> | undefined,
      });

      await updateOpportunity(oppId, {
        ...(item.name?.trim() ? { name: item.name.trim() } : {}),
        ...(item.phone?.trim() ? { phone: item.phone.trim() } : {}),
        ...(item.email?.trim() ? { email: item.email.trim() } : {}),
        customValues,
      });

      const contactId = String(existing.contactId ?? "").trim();
      if (contactId) {
        const lead = await getLeadById(contactId);
        if (lead) {
          const patch = buildMoverContactCustomPatchFromWelcome(item);
          const patchRec = patch as Record<string, unknown>;
          const prevCf = (lead.customFields ?? {}) as Record<string, unknown>;
          const mergedCf = { ...prevCf, ...patchRec };
          let customFields = await validateCustomValues("contact", mergedCf, {
            pipelineId: payingPipelineId,
            previousValues: prevCf,
          });
          for (const fid of moverFieldIdSet) {
            if (Object.prototype.hasOwnProperty.call(patchRec, fid)) {
              customFields = { ...customFields, [fid]: patchRec[fid] };
            }
          }
          await updateLead(contactId, {
            pipelineId: payingPipelineId,
            ...(item.name?.trim() ? { name: item.name.trim() } : {}),
            ...(item.email?.trim() ? { email: item.email.trim() } : {}),
            ...(item.phone?.trim() ? { phone: item.phone.trim() } : {}),
            customFields,
          });
          results.push({ opportunityId: oppId, contactId, updated: true });
        } else {
          results.push({ opportunityId: oppId, updated: true, error: "איש קשר מקושר לא נמצא" });
        }
      } else {
        results.push({ opportunityId: oppId, updated: true });
      }
    } catch (e) {
      results.push({
        opportunityId: "",
        updated: false,
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  const failed = results.filter((r) => !r.updated);
  if (failed.length === results.length) {
    return NextResponse.json(
      { ok: false, error: failed[0]?.error ?? "Update failed", results },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, results });
}

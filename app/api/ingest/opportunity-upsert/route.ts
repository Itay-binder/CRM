import { NextRequest, NextResponse } from "next/server";
import { getExternalRef, upsertExternalRef } from "@/lib/externalRefs/repo";
import { validateCustomValues } from "@/lib/customFields/repo";
import { createOpportunity } from "@/lib/opportunities/repo";
import { getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

function providedApiKey(req: NextRequest): string | null {
  const direct = req.headers.get("x-api-key");
  if (direct?.trim()) return direct.trim();
  const legacy = req.headers.get("x-crm-api-key");
  if (legacy?.trim()) return legacy.trim();
  const authz = req.headers.get("authorization");
  if (authz?.startsWith("Bearer ")) return authz.slice(7).trim();
  return null;
}

function checkIngestAuth(req: NextRequest): boolean {
  const expected = process.env.CRM_INGEST_API_KEY?.trim();
  if (!expected) return false;
  const got = providedApiKey(req);
  return Boolean(got && got === expected);
}

function pickString(
  obj: Record<string, unknown>,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function pickNumber(
  obj: Record<string, unknown>,
  keys: string[]
): number | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string" && v.trim()) {
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  return undefined;
}

function pickStringArray(
  obj: Record<string, unknown>,
  keys: string[]
): string[] | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (Array.isArray(v)) {
      return v.map((x) => String(x).trim()).filter(Boolean);
    }
    if (typeof v === "string" && v.trim()) {
      return v
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }
  }
  return undefined;
}

async function updateOpportunityById(
  id: string,
  updates: Record<string, unknown>
): Promise<void> {
  const db = await getAdminDb();
  await db.collection("opportunities").doc(id).set(
    {
      ...updates,
      updatedAt: new Date(),
    },
    { merge: true }
  );
}

export async function POST(req: NextRequest) {
  if (!checkIngestAuth(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" } satisfies ApiErr,
      { status: 401 }
    );
  }

  try {
    const body = (await req.json()) as {
      provider?: string;
      externalId?: string;
      opportunity?: Record<string, unknown> & {
        name?: string;
        contactId?: string;
        pipelineId?: string;
        stage?: string;
        value?: number;
        customValues?: Record<string, unknown>;
      };
    };

    const provider = body.provider?.trim() || "make";
    const externalId = body.externalId?.trim();
    const o = (body.opportunity ?? {}) as Record<string, unknown>;
    const contactId = pickString(o, ["contactId", "opportunity_contact_id"]);
    if (!contactId?.trim()) {
      throw new Error("opportunity.contactId is required");
    }

    const systemKeys = new Set([
      "name",
      "opportunity_name",
      "contactId",
      "opportunity_contact_id",
      "pipelineId",
      "opportunity_pipeline_id",
      "stage",
      "opportunity_stage",
      "status",
      "opportunity_status",
      "value",
      "opportunity_value",
      "email",
      "opportunity_email",
      "phone",
      "opportunity_phone",
      "utmSource",
      "utm_source",
      "opportunity_utm_source",
      "utmCampaign",
      "utm_campaign",
      "opportunity_utm_campaign",
      "utmMedium",
      "utm_medium",
      "opportunity_utm_medium",
      "utmContent",
      "utm_content",
      "opportunity_utm_content",
      "landingpage",
      "opportunity_landingpage",
      "tags",
      "opportunity_tags",
      "assignedRep",
      "opportunity_assigned_rep",
      "opportunity_assignedRep",
      "customValues",
    ]);
    const directFieldIdValues = Object.fromEntries(
      Object.entries(o).filter(([k]) => !systemKeys.has(k))
    );
    const customValues = await validateCustomValues("opportunity", {
      ...((o.customValues as Record<string, unknown> | undefined) ?? {}),
      ...directFieldIdValues,
    });

    const name = pickString(o, ["name", "opportunity_name"]);
    const pipelineId = pickString(o, ["pipelineId", "opportunity_pipeline_id"]);
    const stage = pickString(o, ["stage", "opportunity_stage"]);
    const statusRaw = pickString(o, ["status", "opportunity_status"]);
    const value = pickNumber(o, ["value", "opportunity_value"]);
    const email = pickString(o, ["email", "opportunity_email"]);
    const phone = pickString(o, ["phone", "opportunity_phone"]);
    const utmSource = pickString(o, ["utmSource", "utm_source", "opportunity_utm_source"]);
    const utmCampaign = pickString(o, ["utmCampaign", "utm_campaign", "opportunity_utm_campaign"]);
    const utmMedium = pickString(o, ["utmMedium", "utm_medium", "opportunity_utm_medium"]);
    const utmContent = pickString(o, ["utmContent", "utm_content", "opportunity_utm_content"]);
    const landingpage = pickString(o, ["landingpage", "opportunity_landingpage"]);
    const tags = pickStringArray(o, ["tags", "opportunity_tags"]);
    const assignedRep = pickString(o, [
      "assignedRep",
      "opportunity_assigned_rep",
      "opportunity_assignedRep",
    ]);

    let oppId: string | null = null;
    if (externalId) {
      const ref = await getExternalRef(provider, externalId);
      if (ref?.entityType === "opportunity") oppId = ref.entityId;
    }

    if (oppId) {
      await updateOpportunityById(oppId, {
        name: name || undefined,
        stage: stage || undefined,
        pipelineId: pipelineId || undefined,
        status:
          statusRaw === "זכיה" || statusRaw === "הפסד" || statusRaw === "פתוח"
            ? statusRaw
            : undefined,
        value: value ?? undefined,
        email: email ?? undefined,
        phone: phone ?? undefined,
        utmSource: utmSource ?? undefined,
        utmCampaign: utmCampaign ?? undefined,
        utmMedium: utmMedium ?? undefined,
        utmContent: utmContent ?? undefined,
        landingpage: landingpage ?? undefined,
        tags: tags ?? undefined,
        assignedRep: assignedRep ?? undefined,
        customValues,
      });
      if (externalId) {
        await upsertExternalRef({
          provider,
          externalId,
          entityType: "opportunity",
          entityId: oppId,
        });
      }
      return NextResponse.json({ ok: true, opportunity: { id: oppId, updated: true } });
    }

    const created = await createOpportunity({
      name,
      contactId,
      pipelineId: pipelineId ?? "",
      stage,
      status:
        statusRaw === "זכיה" || statusRaw === "הפסד" || statusRaw === "פתוח"
          ? statusRaw
          : undefined,
      value,
      email,
      phone,
      utmSource,
      utmCampaign,
      utmMedium,
      utmContent,
      landingpage,
      tags,
      assignedRep,
      customValues,
    });

    if (externalId) {
      await upsertExternalRef({
        provider,
        externalId,
        entityType: "opportunity",
        entityId: created.id,
      });
    }

    return NextResponse.json({
      ok: true,
      opportunity: {
        id: created.id,
        opportunityCode: created.opportunityCode ?? "",
        name: created.name,
        stage: created.stage,
        pipelineId: created.pipelineId,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}


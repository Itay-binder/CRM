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

async function updateOpportunityById(
  id: string,
  updates: Record<string, unknown>
): Promise<void> {
  await getAdminDb().collection("opportunities").doc(id).set(
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
      opportunity?: {
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
    const o = body.opportunity ?? {};
    if (!o.contactId?.trim()) {
      throw new Error("opportunity.contactId is required");
    }

    const customValues = await validateCustomValues("opportunity", o.customValues);

    let oppId: string | null = null;
    if (externalId) {
      const ref = await getExternalRef(provider, externalId);
      if (ref?.entityType === "opportunity") oppId = ref.entityId;
    }

    if (oppId) {
      await updateOpportunityById(oppId, {
        name: o.name?.trim() || undefined,
        stage: o.stage?.trim() || undefined,
        pipelineId: o.pipelineId?.trim() || undefined,
        value: typeof o.value === "number" ? o.value : undefined,
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
      name: o.name,
      contactId: o.contactId,
      pipelineId: o.pipelineId ?? "",
      stage: o.stage,
      value: o.value,
    });
    if (Object.keys(customValues).length) {
      await updateOpportunityById(created.id, { customValues });
    }

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


import { NextRequest, NextResponse } from "next/server";
import { getExternalRef, upsertExternalRef } from "@/lib/externalRefs/repo";
import { upsertLead } from "@/lib/leads/repo";
import { validateCustomValues } from "@/lib/customFields/repo";

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
      contact?: Record<string, unknown> & {
        uniqueKey?: string;
        email?: string;
        phone?: string;
        fullName?: string;
        name?: string;
        stage?: string;
        source?: string;
        customValues?: Record<string, unknown>;
      };
    };

    const provider = body.provider?.trim() || "make";
    const externalId = body.externalId?.trim();
    const c = (body.contact ?? {}) as Record<string, unknown>;

    let existingEntityId: string | undefined;
    if (externalId) {
      const ref = await getExternalRef(provider, externalId);
      if (ref?.entityType === "contact" && ref.entityId) {
        existingEntityId = ref.entityId;
      }
    }

    const uniqueKey = pickString(c, ["uniqueKey", "contact_unique_key"]);
    const email = pickString(c, ["email", "contact_email"]);
    const phone = pickString(c, ["phone", "contact_phone"]);
    const name = pickString(c, ["fullName", "name", "contact_name"]);
    const stage = pickString(c, ["stage", "contact_stage"]);
    const source = pickString(c, ["source", "contact_source"]);
    const statusRaw = pickString(c, ["status", "contact_status"]);
    const assignedRep = pickString(c, [
      "assignedRep",
      "contact_assigned_rep",
      "contact_assignedRep",
    ]);
    const pipelineId = pickString(c, ["pipelineId", "contact_pipeline_id"]);

    const systemKeys = new Set([
      "uniqueKey",
      "contact_unique_key",
      "email",
      "contact_email",
      "phone",
      "contact_phone",
      "fullName",
      "name",
      "contact_name",
      "stage",
      "contact_stage",
      "source",
      "contact_source",
      "status",
      "contact_status",
      "assignedRep",
      "contact_assigned_rep",
      "contact_assignedRep",
      "pipelineId",
      "contact_pipeline_id",
      "customValues",
      "customFields",
    ]);
    const directFieldIdValues = Object.fromEntries(
      Object.entries(c).filter(([k]) => !systemKeys.has(k))
    );
    const customInput = {
      ...((c.customValues as Record<string, unknown> | undefined) ?? {}),
      ...((c.customFields as Record<string, unknown> | undefined) ?? {}),
      ...directFieldIdValues,
    };
    const customValues = await validateCustomValues("contact", customInput);
    const lead = await upsertLead({
      id: existingEntityId,
      uniqueKey,
      email,
      phone,
      name,
      stage: stage ?? "Pending",
      source: source ?? "ingest",
      status:
        statusRaw === "זכיה" || statusRaw === "הפסד" || statusRaw === "פתוח"
          ? statusRaw
          : "פתוח",
      assignedRep,
      pipelineId,
      customFields: customValues,
    });

    if (externalId) {
      await upsertExternalRef({
        provider,
        externalId,
        entityType: "contact",
        entityId: lead.id,
      });
    }

    return NextResponse.json({
      ok: true,
      contact: {
        id: lead.id,
        email: lead.email ?? "",
        phone: lead.phone ?? "",
        name: lead.name ?? "",
        stage: lead.stage,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}


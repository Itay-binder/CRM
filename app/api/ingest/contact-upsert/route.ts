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
      contact?: {
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
    const c = body.contact ?? {};

    let existingEntityId: string | undefined;
    if (externalId) {
      const ref = await getExternalRef(provider, externalId);
      if (ref?.entityType === "contact" && ref.entityId) {
        existingEntityId = ref.entityId;
      }
    }

    const customValues = await validateCustomValues("contact", c.customValues);
    const lead = await upsertLead({
      id: existingEntityId,
      uniqueKey: c.uniqueKey,
      email: c.email,
      phone: c.phone,
      name: c.fullName || c.name,
      stage: c.stage ?? "Pending",
      source: c.source ?? "ingest",
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


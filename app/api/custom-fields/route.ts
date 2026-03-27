import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import {
  deleteCustomField,
  listCustomFields,
  normalizeExistingCustomFieldIds,
  type CustomFieldEntity,
  type CustomFieldType,
  upsertCustomField,
} from "@/lib/customFields/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error } satisfies ApiErr,
      { status: auth.status }
    );
  }

  try {
    const entity = req.nextUrl.searchParams.get("entityType") as
      | CustomFieldEntity
      | null;
    const fields = await listCustomFields(entity ?? undefined);
    return NextResponse.json({ ok: true, fields });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Unknown error",
      } satisfies ApiErr,
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error } satisfies ApiErr,
      { status: auth.status }
    );
  }

  try {
    const body = (await req.json()) as {
      action?: "normalize_ids";
      fieldId?: string;
      entityType?: CustomFieldEntity;
      label?: string;
      type?: CustomFieldType;
      options?: string[];
      isRequired?: boolean;
      isActive?: boolean;
    };
    if (body.action === "normalize_ids") {
      const result = await normalizeExistingCustomFieldIds();
      return NextResponse.json({ ok: true, result });
    }

    const field = await upsertCustomField({
      fieldId: body.fieldId,
      entityType: body.entityType ?? "contact",
      label: body.label ?? "",
      type: body.type ?? "text",
      options: body.options ?? [],
      isRequired: body.isRequired ?? false,
      isActive: body.isActive ?? true,
    });

    return NextResponse.json({ ok: true, field });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Unknown error",
      } satisfies ApiErr,
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error } satisfies ApiErr,
      { status: auth.status }
    );
  }
  try {
    const body = (await req.json()) as { fieldId?: string };
    const fieldId = body.fieldId?.trim();
    if (!fieldId) {
      return NextResponse.json(
        { ok: false, error: "fieldId is required" } satisfies ApiErr,
        { status: 400 }
      );
    }
    await deleteCustomField(fieldId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Unknown error",
      } satisfies ApiErr,
      { status: 400 }
    );
  }
}


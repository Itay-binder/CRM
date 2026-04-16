import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { isAdminEmail } from "@/lib/auth/profile";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  getWhatsAppMetaConfig,
  listWhatsAppTemplates,
  patchWhatsAppTemplateMeta,
} from "@/lib/whatsapp/repo";
import { submitTemplateToMeta } from "@/lib/whatsapp/meta";

export const dynamic = "force-dynamic";

function canManage(user: { profile: { role: string }; email?: string }): boolean {
  return user.profile.role === "admin" || isAdminEmail(user.email);
}

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!canManage(auth.user)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const templateId = id?.trim();
  if (!templateId) {
    return NextResponse.json({ ok: false, error: "Invalid template id" }, { status: 400 });
  }
  try {
    const db = await getAdminDb();
    const [config, templates] = await Promise.all([
      getWhatsAppMetaConfig(db),
      listWhatsAppTemplates(db),
    ]);
    if (!config || !config.wabaId || !config.systemUserToken) {
      return NextResponse.json(
        { ok: false, error: "Meta settings are missing. Please save WhatsApp settings first." },
        { status: 400 }
      );
    }
    const template = templates.find((t) => t.id === templateId);
    if (!template) {
      return NextResponse.json({ ok: false, error: "Template not found" }, { status: 404 });
    }
    const metaRes = await submitTemplateToMeta(config, template);
    const patched = await patchWhatsAppTemplateMeta(db, templateId, {
      status: "submitted",
      metaTemplateId: metaRes.id,
      metaStatus: metaRes.status ?? "PENDING",
      rejectionReason: undefined,
    });
    return NextResponse.json({ ok: true, template: patched, meta: metaRes });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    try {
      const db = await getAdminDb();
      await patchWhatsAppTemplateMeta(db, templateId, {
        status: "rejected",
        rejectionReason: message,
      });
    } catch {
      // ignore patch errors to avoid masking root cause
    }
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

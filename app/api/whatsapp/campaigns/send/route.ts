import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getAdminDb } from "@/lib/firebase/admin";
import { getLeadById, normalizePhone } from "@/lib/leads/repo";
import { sendTemplateMessageViaMeta } from "@/lib/whatsapp/meta";
import {
  appendWhatsAppCampaign,
  getWhatsAppMetaConfig,
  listWhatsAppCampaigns,
  listWhatsAppTemplates,
  type WhatsAppCampaignDispatch,
} from "@/lib/whatsapp/repo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  try {
    const db = await getAdminDb();
    const campaigns = await listWhatsAppCampaigns(db);
    return NextResponse.json({ ok: true, campaigns });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: {
    templateId?: string;
    recipientIds?: string[];
    parameterValues?: string[];
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const templateId = body.templateId?.trim() ?? "";
  const recipientIds = Array.isArray(body.recipientIds)
    ? Array.from(new Set(body.recipientIds.map((x) => String(x).trim()).filter(Boolean)))
    : [];
  if (!templateId) {
    return NextResponse.json({ ok: false, error: "templateId is required" }, { status: 400 });
  }
  if (recipientIds.length === 0) {
    return NextResponse.json({ ok: false, error: "recipientIds is required" }, { status: 400 });
  }
  if (recipientIds.length > 200) {
    return NextResponse.json(
      { ok: false, error: "For safety, one campaign is limited to 200 recipients." },
      { status: 400 }
    );
  }

  try {
    const db = await getAdminDb();
    const [config, templates] = await Promise.all([
      getWhatsAppMetaConfig(db),
      listWhatsAppTemplates(db),
    ]);
    if (!config || !config.phoneNumberId || !config.systemUserToken) {
      return NextResponse.json(
        { ok: false, error: "Meta settings are missing. Please save WhatsApp settings first." },
        { status: 400 }
      );
    }
    const template = templates.find((t) => t.id === templateId);
    if (!template) {
      return NextResponse.json({ ok: false, error: "Template not found" }, { status: 404 });
    }

    const parameterValues = Array.isArray(body.parameterValues)
      ? body.parameterValues.map((x) => String(x ?? "").trim())
      : [];

    const dispatches: WhatsAppCampaignDispatch[] = [];
    for (const id of recipientIds) {
      const lead = await getLeadById(id);
      if (!lead) {
        dispatches.push({
          contactId: id,
          contactName: id,
          to: "",
          status: "failed",
          error: "Contact not found",
        });
        continue;
      }
      const normalized = normalizePhone(lead.phone);
      if (!normalized) {
        dispatches.push({
          contactId: lead.id,
          contactName: lead.name || lead.email || lead.id,
          to: lead.phone || "",
          status: "failed",
          error: "Contact has no valid WhatsApp number",
        });
        continue;
      }
      try {
        const sent = await sendTemplateMessageViaMeta(config, {
          to: normalized,
          templateName: template.name,
          language: template.language,
          parameterValues,
        });
        dispatches.push({
          contactId: lead.id,
          contactName: lead.name || lead.email || lead.id,
          to: normalized,
          status: "sent",
          messageId: sent.messageId,
        });
      } catch (e) {
        dispatches.push({
          contactId: lead.id,
          contactName: lead.name || lead.email || lead.id,
          to: normalized,
          status: "failed",
          error: e instanceof Error ? e.message : "Meta send failed",
        });
      }
    }

    const sentCount = dispatches.filter((d) => d.status === "sent").length;
    const failedCount = dispatches.length - sentCount;
    const campaign = {
      id: randomUUID(),
      templateId: template.id,
      templateName: template.name,
      templateLanguage: template.language,
      parameterValues,
      recipientCount: dispatches.length,
      sentCount,
      failedCount,
      createdBy: auth.user.email ?? auth.user.uid,
      createdAt: new Date().toISOString(),
      dispatches,
    };
    await appendWhatsAppCampaign(db, campaign);
    return NextResponse.json({ ok: true, campaign });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 }
    );
  }
}

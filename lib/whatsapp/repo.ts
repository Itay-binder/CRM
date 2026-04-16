import type { Firestore } from "firebase-admin/firestore";
import type { AudienceCondition, AudienceLogic } from "@/lib/whatsapp/audienceFilter";

const COLLECTION = "integrationSettings";
const CONFIG_DOC_ID = "whatsappMetaConfig";
const TEMPLATES_DOC_ID = "whatsappTemplates";
const CAMPAIGNS_DOC_ID = "whatsappCampaigns";
const DRAFTS_DOC_ID = "whatsappBroadcastDrafts";

export type WhatsAppMetaConfig = {
  appId: string;
  businessAccountId: string;
  wabaId: string;
  phoneNumberId: string;
  systemUserToken: string;
  updatedAt: string;
};

export type WhatsAppTemplateStatus = "draft" | "submitted" | "approved" | "rejected";
export type WhatsAppTemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";

export type WhatsAppTemplateRecord = {
  id: string;
  name: string;
  category: WhatsAppTemplateCategory;
  language: string;
  bodyText: string;
  exampleValues: string[];
  status: WhatsAppTemplateStatus;
  metaTemplateId?: string;
  metaStatus?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
};

export type WhatsAppCampaignDispatch = {
  contactId: string;
  contactName: string;
  to: string;
  status: "sent" | "failed";
  messageId?: string;
  error?: string;
};

export type WhatsAppCampaignRecord = {
  id: string;
  /** שם הדיוור להצגה בהיסטוריה */
  broadcastName?: string;
  templateId: string;
  templateName: string;
  templateLanguage: string;
  parameterValues: string[];
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdBy: string;
  createdAt: string;
  dispatches: WhatsAppCampaignDispatch[];
};

export type WhatsAppBroadcastDraftRecord = {
  id: string;
  name: string;
  templateId: string;
  parameterValues: string[];
  conditions: AudienceCondition[];
  logic: AudienceLogic;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);
}

export async function getWhatsAppMetaConfig(db: Firestore): Promise<WhatsAppMetaConfig | null> {
  const snap = await db.collection(COLLECTION).doc(CONFIG_DOC_ID).get();
  if (!snap.exists) return null;
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  return {
    appId: asString(d.appId),
    businessAccountId: asString(d.businessAccountId),
    wabaId: asString(d.wabaId),
    phoneNumberId: asString(d.phoneNumberId),
    systemUserToken: asString(d.systemUserToken),
    updatedAt: asString(d.updatedAt),
  };
}

export async function saveWhatsAppMetaConfig(
  db: Firestore,
  input: Partial<WhatsAppMetaConfig> & Pick<WhatsAppMetaConfig, "wabaId" | "phoneNumberId">
): Promise<WhatsAppMetaConfig> {
  const prev = await getWhatsAppMetaConfig(db);
  const now = new Date().toISOString();
  const next: WhatsAppMetaConfig = {
    appId: input.appId?.trim() ?? prev?.appId ?? "",
    businessAccountId: input.businessAccountId?.trim() ?? prev?.businessAccountId ?? "",
    wabaId: input.wabaId.trim(),
    phoneNumberId: input.phoneNumberId.trim(),
    systemUserToken:
      input.systemUserToken !== undefined
        ? input.systemUserToken.trim()
        : (prev?.systemUserToken ?? ""),
    updatedAt: now,
  };
  await db.collection(COLLECTION).doc(CONFIG_DOC_ID).set(next, { merge: true });
  return next;
}

export async function listWhatsAppTemplates(db: Firestore): Promise<WhatsAppTemplateRecord[]> {
  const snap = await db.collection(COLLECTION).doc(TEMPLATES_DOC_ID).get();
  if (!snap.exists) return [];
  const raw = (snap.data() as { templates?: unknown } | undefined)?.templates;
  if (!Array.isArray(raw)) return [];
  const templates = raw
    .map((item): WhatsAppTemplateRecord | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const id = asString(row.id).trim();
      const name = asString(row.name).trim();
      const bodyText = asString(row.bodyText).trim();
      const language = asString(row.language).trim() || "he";
      if (!id || !name || !bodyText) return null;
      const categoryRaw = asString(row.category).trim();
      const category: WhatsAppTemplateCategory =
        categoryRaw === "AUTHENTICATION" || categoryRaw === "UTILITY" ? categoryRaw : "MARKETING";
      const statusRaw = asString(row.status).trim();
      const status: WhatsAppTemplateStatus =
        statusRaw === "submitted" || statusRaw === "approved" || statusRaw === "rejected"
          ? statusRaw
          : "draft";
      return {
        id,
        name,
        category,
        language,
        bodyText,
        exampleValues: asStringArray(row.exampleValues),
        status,
        metaTemplateId: asString(row.metaTemplateId).trim() || undefined,
        metaStatus: asString(row.metaStatus).trim() || undefined,
        rejectionReason: asString(row.rejectionReason).trim() || undefined,
        createdAt: asString(row.createdAt),
        updatedAt: asString(row.updatedAt),
      };
    })
    .filter((x): x is WhatsAppTemplateRecord => Boolean(x));
  return templates.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveWhatsAppTemplate(
  db: Firestore,
  input: Omit<
    WhatsAppTemplateRecord,
    "createdAt" | "updatedAt" | "status" | "metaTemplateId" | "metaStatus" | "rejectionReason"
  > &
    Partial<Pick<WhatsAppTemplateRecord, "status">>
): Promise<WhatsAppTemplateRecord> {
  const templates = await listWhatsAppTemplates(db);
  const now = new Date().toISOString();
  const idx = templates.findIndex((t) => t.id === input.id);
  if (idx >= 0) {
    const prev = templates[idx];
    const updated: WhatsAppTemplateRecord = {
      ...prev,
      name: input.name.trim(),
      category: input.category,
      language: input.language.trim() || "he",
      bodyText: input.bodyText.trim(),
      exampleValues: input.exampleValues.map((x) => x.trim()).filter(Boolean),
      status: input.status ?? prev.status,
      updatedAt: now,
    };
    templates[idx] = updated;
    await db.collection(COLLECTION).doc(TEMPLATES_DOC_ID).set({ templates }, { merge: true });
    return updated;
  }
  const created: WhatsAppTemplateRecord = {
    id: input.id,
    name: input.name.trim(),
    category: input.category,
    language: input.language.trim() || "he",
    bodyText: input.bodyText.trim(),
    exampleValues: input.exampleValues.map((x) => x.trim()).filter(Boolean),
    status: input.status ?? "draft",
    createdAt: now,
    updatedAt: now,
  };
  const next = [created, ...templates];
  await db.collection(COLLECTION).doc(TEMPLATES_DOC_ID).set({ templates: next }, { merge: true });
  return created;
}

export async function patchWhatsAppTemplateMeta(
  db: Firestore,
  id: string,
  patch: Partial<
    Pick<WhatsAppTemplateRecord, "status" | "metaTemplateId" | "metaStatus" | "rejectionReason">
  >
): Promise<WhatsAppTemplateRecord> {
  const templates = await listWhatsAppTemplates(db);
  const idx = templates.findIndex((t) => t.id === id);
  if (idx < 0) throw new Error("Template not found");
  const next: WhatsAppTemplateRecord = {
    ...templates[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  templates[idx] = next;
  await db.collection(COLLECTION).doc(TEMPLATES_DOC_ID).set({ templates }, { merge: true });
  return next;
}

export async function listWhatsAppCampaigns(db: Firestore): Promise<WhatsAppCampaignRecord[]> {
  const snap = await db.collection(COLLECTION).doc(CAMPAIGNS_DOC_ID).get();
  if (!snap.exists) return [];
  const raw = (snap.data() as { campaigns?: unknown } | undefined)?.campaigns;
  if (!Array.isArray(raw)) return [];
  const rows = raw
    .map((item): WhatsAppCampaignRecord | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const id = asString(row.id).trim();
      if (!id) return null;
      const dispatchesRaw = Array.isArray(row.dispatches) ? row.dispatches : [];
      const dispatches = dispatchesRaw
        .map((d): WhatsAppCampaignDispatch | null => {
          if (!d || typeof d !== "object") return null;
          const x = d as Record<string, unknown>;
          return {
            contactId: asString(x.contactId),
            contactName: asString(x.contactName),
            to: asString(x.to),
            status: asString(x.status) === "sent" ? "sent" : "failed",
            messageId: asString(x.messageId) || undefined,
            error: asString(x.error) || undefined,
          };
        })
        .filter((x): x is WhatsAppCampaignDispatch => Boolean(x));
      return {
        id,
        broadcastName: asString(row.broadcastName).trim() || undefined,
        templateId: asString(row.templateId),
        templateName: asString(row.templateName),
        templateLanguage: asString(row.templateLanguage),
        parameterValues: asStringArray(row.parameterValues),
        recipientCount: Number(row.recipientCount ?? 0),
        sentCount: Number(row.sentCount ?? 0),
        failedCount: Number(row.failedCount ?? 0),
        createdBy: asString(row.createdBy),
        createdAt: asString(row.createdAt),
        dispatches,
      };
    })
    .filter((x): x is WhatsAppCampaignRecord => Boolean(x));
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function appendWhatsAppCampaign(
  db: Firestore,
  campaign: WhatsAppCampaignRecord
): Promise<void> {
  const prev = await listWhatsAppCampaigns(db);
  const next = [campaign, ...prev].slice(0, 100);
  await db.collection(COLLECTION).doc(CAMPAIGNS_DOC_ID).set({ campaigns: next }, { merge: true });
}

function parseAudienceConditions(raw: unknown): AudienceCondition[] {
  if (!Array.isArray(raw)) return [];
  const out: AudienceCondition[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = asString(o.id).trim();
    const field = asString(o.field).trim() as AudienceCondition["field"];
    const op = asString(o.op).trim() as AudienceCondition["op"];
    const value = asString(o.value);
    if (!id) continue;
    if (!["tag", "name", "phone", "email", "status"].includes(field)) continue;
    out.push({ id, field, op, value });
  }
  return out;
}

export async function listWhatsAppBroadcastDrafts(db: Firestore): Promise<WhatsAppBroadcastDraftRecord[]> {
  const snap = await db.collection(COLLECTION).doc(DRAFTS_DOC_ID).get();
  if (!snap.exists) return [];
  const raw = (snap.data() as { drafts?: unknown } | undefined)?.drafts;
  if (!Array.isArray(raw)) return [];
  const rows = raw
    .map((item): WhatsAppBroadcastDraftRecord | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const id = asString(row.id).trim();
      if (!id) return null;
      const logicRaw = asString(row.logic).trim();
      const logic: AudienceLogic = logicRaw === "or" ? "or" : "and";
      return {
        id,
        name: asString(row.name).trim() || "ללא שם",
        templateId: asString(row.templateId),
        parameterValues: asStringArray(row.parameterValues),
        conditions: parseAudienceConditions(row.conditions),
        logic,
        createdAt: asString(row.createdAt),
        updatedAt: asString(row.updatedAt),
        createdBy: asString(row.createdBy),
      };
    })
    .filter((x): x is WhatsAppBroadcastDraftRecord => Boolean(x));
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveWhatsAppBroadcastDraft(
  db: Firestore,
  input: Omit<WhatsAppBroadcastDraftRecord, "createdAt" | "updatedAt"> &
    Partial<Pick<WhatsAppBroadcastDraftRecord, "createdAt">>
): Promise<WhatsAppBroadcastDraftRecord> {
  const drafts = await listWhatsAppBroadcastDrafts(db);
  const now = new Date().toISOString();
  const idx = drafts.findIndex((d) => d.id === input.id);
  if (idx >= 0) {
    const prev = drafts[idx];
    const updated: WhatsAppBroadcastDraftRecord = {
      ...prev,
      name: input.name.trim() || prev.name,
      templateId: input.templateId.trim(),
      parameterValues: input.parameterValues.map((x) => x.trim()).filter(Boolean),
      conditions: input.conditions,
      logic: input.logic,
      updatedAt: now,
    };
    drafts[idx] = updated;
    await db.collection(COLLECTION).doc(DRAFTS_DOC_ID).set({ drafts }, { merge: true });
    return updated;
  }
  const created: WhatsAppBroadcastDraftRecord = {
    id: input.id,
    name: input.name.trim() || "דיוור חדש",
    templateId: input.templateId.trim(),
    parameterValues: input.parameterValues.map((x) => x.trim()).filter(Boolean),
    conditions: input.conditions,
    logic: input.logic,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    createdBy: input.createdBy,
  };
  await db.collection(COLLECTION).doc(DRAFTS_DOC_ID).set({ drafts: [created, ...drafts] }, { merge: true });
  return created;
}

export async function deleteWhatsAppBroadcastDraft(db: Firestore, id: string): Promise<void> {
  const drafts = await listWhatsAppBroadcastDrafts(db);
  const next = drafts.filter((d) => d.id !== id);
  await db.collection(COLLECTION).doc(DRAFTS_DOC_ID).set({ drafts: next }, { merge: true });
}

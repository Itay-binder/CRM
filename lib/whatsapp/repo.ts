import { randomUUID } from "crypto";
import type { Firestore } from "firebase-admin/firestore";
import type { AudienceCondition, AudienceLogic } from "@/lib/whatsapp/audienceFilter";
import {
  countBodyPlaceholders,
  normalizeParameterSources,
  type TemplateParamSource,
} from "@/lib/whatsapp/templateParams";

const COLLECTION = "integrationSettings";
const CONFIG_DOC_ID = "whatsappMetaConfig";
const TEMPLATES_DOC_ID = "whatsappTemplates";

/** Firestore לא מקבל ערך undefined בשדות — JSON מדלג על מפתחות כאלה */
function stripUndefinedForFirestore<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
const CAMPAIGNS_DOC_ID = "whatsappCampaigns";
const DRAFTS_DOC_ID = "whatsappBroadcastDrafts";
const CHATS_COLLECTION = "whatsappChats";

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

export type WhatsAppTemplateButton = {
  type: "QUICK_REPLY" | "URL";
  text: string;
  /** לכפתור URL — כתובת מלאה (ללא משתנים דינמיים בגרסה זו) */
  url?: string;
};

/** כותרת תבנית. שימו לב: שמע — בפועל כ־DOCUMENT ב־WhatsApp */
export type WhatsAppHeaderFormat = "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";

export type WhatsAppTemplateRecord = {
  id: string;
  name: string;
  category: WhatsAppTemplateCategory;
  language: string;
  bodyText: string;
  exampleValues: string[];
  headerFormat?: WhatsAppHeaderFormat;
  /** כותרת טקסט (עד 60 תווים; ללא משתנים בגרסה זו) */
  headerText?: string;
  /** קישור HTTPS ציבורי לדוגמת מדיה בכותרת (תמונה/וידאו/מסמך) */
  headerMediaUrl?: string;
  /** פוטר (עד 60 תווים, טקסט סטטי) */
  footerText?: string;
  /** מיפוי {{1}}, {{2}}… — manual = מהדיוור או ערכי דוגמה */
  parameterSources?: TemplateParamSource[];
  /** עד 3 כפתורים (Quick Reply / URL) לאישור במטא */
  buttonRows?: WhatsAppTemplateButton[];
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

export type WhatsAppChatMessageRecord = {
  id: string;
  direction: "inbound" | "outbound";
  text: string;
  from: string;
  to: string;
  createdAt: string;
  messageId?: string;
};

export type WhatsAppChatThreadRecord = {
  id: string;
  phone: string;
  contactId?: string;
  contactName?: string;
  marketingApproved: boolean;
  lastMessageAt: string;
  lastMessagePreview: string;
  unreadCount: number;
  updatedAt: string;
  messages: WhatsAppChatMessageRecord[];
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

function parseButtonRows(raw: unknown): WhatsAppTemplateRecord["buttonRows"] {
  if (!Array.isArray(raw)) return undefined;
  const out: NonNullable<WhatsAppTemplateRecord["buttonRows"]> = [];
  let urlUsed = 0;
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const type = asString(o.type).trim().toUpperCase();
    const text = asString(o.text).trim().slice(0, 25);
    if (!text) continue;
    if (type === "URL") {
      if (urlUsed >= 1) continue;
      const url = asString(o.url).trim();
      if (!url) continue;
      out.push({ type: "URL", text, url });
      urlUsed += 1;
    } else {
      out.push({ type: "QUICK_REPLY", text });
    }
    if (out.length >= 3) break;
  }
  return out.length ? out : undefined;
}

function parseHeaderFormat(raw: unknown): WhatsAppHeaderFormat {
  const s = asString(raw).trim().toUpperCase();
  if (s === "TEXT" || s === "IMAGE" || s === "VIDEO" || s === "DOCUMENT") return s;
  return "NONE";
}

function normalizeTemplateHeaderFooter(t: WhatsAppTemplateRecord): WhatsAppTemplateRecord {
  const hf = t.headerFormat ?? "NONE";
  const next = { ...t };
  if (hf === "NONE") {
    next.headerText = undefined;
    next.headerMediaUrl = undefined;
  } else if (hf === "TEXT") {
    next.headerMediaUrl = undefined;
  } else {
    next.headerText = undefined;
  }
  return next;
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
      const slots = countBodyPlaceholders(bodyText);
      const parameterSources =
        Array.isArray(row.parameterSources) && row.parameterSources.length && slots > 0
          ? normalizeParameterSources(row.parameterSources, slots)
          : undefined;
      return {
        id,
        name,
        category,
        language,
        bodyText,
        exampleValues: asStringArray(row.exampleValues),
        headerFormat: parseHeaderFormat(row.headerFormat),
        headerText: asString(row.headerText).trim().slice(0, 60) || undefined,
        headerMediaUrl: asString(row.headerMediaUrl).trim() || undefined,
        footerText: asString(row.footerText).trim().slice(0, 60) || undefined,
        parameterSources,
        buttonRows: parseButtonRows(row.buttonRows),
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
    const slots = countBodyPlaceholders(input.bodyText.trim());
    const updated: WhatsAppTemplateRecord = {
      ...prev,
      name: input.name.trim(),
      category: input.category,
      language: input.language.trim() || "he",
      bodyText: input.bodyText.trim(),
      exampleValues: input.exampleValues.map((x) => x.trim()).filter(Boolean),
      headerFormat: input.headerFormat !== undefined ? parseHeaderFormat(input.headerFormat) : prev.headerFormat,
      headerText:
        input.headerText !== undefined ? asString(input.headerText).trim().slice(0, 60) : prev.headerText,
      headerMediaUrl:
        input.headerMediaUrl !== undefined
          ? asString(input.headerMediaUrl).trim() || undefined
          : prev.headerMediaUrl,
      footerText:
        input.footerText !== undefined ? asString(input.footerText).trim().slice(0, 60) : prev.footerText,
      parameterSources:
        input.parameterSources !== undefined
          ? normalizeParameterSources(input.parameterSources, slots)
          : prev.parameterSources,
      buttonRows: input.buttonRows !== undefined ? parseButtonRows(input.buttonRows) : prev.buttonRows,
      status: input.status ?? prev.status,
      updatedAt: now,
    };
    const normalized = normalizeTemplateHeaderFooter(updated);
    templates[idx] = normalized;
    await db
      .collection(COLLECTION)
      .doc(TEMPLATES_DOC_ID)
      .set(stripUndefinedForFirestore({ templates }), { merge: true });
    return normalized;
  }
  const slots = countBodyPlaceholders(input.bodyText.trim());
  const created: WhatsAppTemplateRecord = {
    id: input.id,
    name: input.name.trim(),
    category: input.category,
    language: input.language.trim() || "he",
    bodyText: input.bodyText.trim(),
    exampleValues: input.exampleValues.map((x) => x.trim()).filter(Boolean),
    headerFormat: input.headerFormat !== undefined ? parseHeaderFormat(input.headerFormat) : "NONE",
    headerText: input.headerText !== undefined ? asString(input.headerText).trim().slice(0, 60) : undefined,
    headerMediaUrl: input.headerMediaUrl !== undefined ? asString(input.headerMediaUrl).trim() || undefined : undefined,
    footerText: input.footerText !== undefined ? asString(input.footerText).trim().slice(0, 60) : undefined,
    parameterSources:
      input.parameterSources !== undefined
        ? normalizeParameterSources(input.parameterSources, slots)
        : undefined,
    buttonRows: input.buttonRows !== undefined ? parseButtonRows(input.buttonRows) : undefined,
    status: input.status ?? "draft",
    createdAt: now,
    updatedAt: now,
  };
  const normalizedCreated = normalizeTemplateHeaderFooter(created);
  const next = [normalizedCreated, ...templates];
  await db
    .collection(COLLECTION)
    .doc(TEMPLATES_DOC_ID)
    .set(stripUndefinedForFirestore({ templates: next }), { merge: true });
  return normalizedCreated;
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
  await db
    .collection(COLLECTION)
    .doc(TEMPLATES_DOC_ID)
    .set(stripUndefinedForFirestore({ templates }), { merge: true });
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

function parseChatMessages(raw: unknown): WhatsAppChatMessageRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: WhatsAppChatMessageRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = asString(row.id).trim();
    const direction = asString(row.direction).trim() === "inbound" ? "inbound" : "outbound";
    const text = asString(row.text);
    const from = asString(row.from).trim();
    const to = asString(row.to).trim();
    const createdAt = asString(row.createdAt).trim();
    if (!id || !from || !to || !createdAt) continue;
    out.push({
      id,
      direction,
      text,
      from,
      to,
      createdAt,
      messageId: asString(row.messageId).trim() || undefined,
    });
  }
  return out
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-200);
}

function normalizeChatPhone(phoneRaw: string): string {
  return phoneRaw.replace(/[^\d]/g, "").trim();
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

export async function listWhatsAppChatThreads(
  db: Firestore,
  limit = 80
): Promise<WhatsAppChatThreadRecord[]> {
  const snap = await db
    .collection(CHATS_COLLECTION)
    .orderBy("lastMessageAt", "desc")
    .limit(Math.max(1, Math.min(200, limit)))
    .get();
  const rows = snap.docs
    .map((doc): WhatsAppChatThreadRecord | null => {
      const d = (doc.data() ?? {}) as Record<string, unknown>;
      const phone = asString(d.phone).trim() || doc.id;
      const lastMessageAt = asString(d.lastMessageAt).trim();
      if (!phone || !lastMessageAt) return null;
      return {
        id: doc.id,
        phone,
        contactId: asString(d.contactId).trim() || undefined,
        contactName: asString(d.contactName).trim() || undefined,
        marketingApproved: d.marketingApproved !== false,
        lastMessageAt,
        lastMessagePreview: asString(d.lastMessagePreview).trim().slice(0, 240),
        unreadCount: Number(d.unreadCount ?? 0),
        updatedAt: asString(d.updatedAt).trim() || lastMessageAt,
        messages: [],
      };
    })
    .filter((x): x is WhatsAppChatThreadRecord => Boolean(x));
  return rows;
}

export async function getWhatsAppChatThread(
  db: Firestore,
  threadId: string
): Promise<WhatsAppChatThreadRecord | null> {
  const id = normalizeChatPhone(threadId);
  if (!id) return null;
  const snap = await db.collection(CHATS_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  const lastMessageAt = asString(d.lastMessageAt).trim();
  if (!lastMessageAt) return null;
  return {
    id: snap.id,
    phone: asString(d.phone).trim() || snap.id,
    contactId: asString(d.contactId).trim() || undefined,
    contactName: asString(d.contactName).trim() || undefined,
    marketingApproved: d.marketingApproved !== false,
    lastMessageAt,
    lastMessagePreview: asString(d.lastMessagePreview).trim().slice(0, 240),
    unreadCount: Number(d.unreadCount ?? 0),
    updatedAt: asString(d.updatedAt).trim() || lastMessageAt,
    messages: parseChatMessages(d.messages),
  };
}

export async function appendWhatsAppChatMessage(
  db: Firestore,
  input: {
    phone: string;
    direction: "inbound" | "outbound";
    text: string;
    from: string;
    to: string;
    createdAt?: string;
    messageId?: string;
    contactId?: string;
    contactName?: string;
    marketingApproved?: boolean;
  }
): Promise<void> {
  const id = normalizeChatPhone(input.phone);
  if (!id) return;
  const ref = db.collection(CHATS_COLLECTION).doc(id);
  const snap = await ref.get();
  const prev = (snap.data() ?? {}) as Record<string, unknown>;
  const now = input.createdAt?.trim() || new Date().toISOString();
  const msg: WhatsAppChatMessageRecord = {
    id: randomUUID(),
    direction: input.direction,
    text: input.text.trim(),
    from: input.from.trim(),
    to: input.to.trim(),
    createdAt: now,
    messageId: input.messageId?.trim() || undefined,
  };
  const nextMessages = [...parseChatMessages(prev.messages), msg].slice(-200);
  const unreadInc = input.direction === "inbound" ? 1 : 0;
  const prevUnread = Number(prev.unreadCount ?? 0);
  await ref.set(
    stripUndefinedForFirestore({
      phone: id,
      contactId: input.contactId?.trim() || asString(prev.contactId).trim() || undefined,
      contactName: input.contactName?.trim() || asString(prev.contactName).trim() || undefined,
      marketingApproved:
        input.marketingApproved !== undefined
          ? input.marketingApproved
          : prev.marketingApproved !== false,
      lastMessageAt: now,
      lastMessagePreview: msg.text.slice(0, 240),
      unreadCount: input.direction === "inbound" ? prevUnread + unreadInc : prevUnread,
      updatedAt: new Date().toISOString(),
      messages: nextMessages,
    }),
    { merge: true }
  );
}

export async function markWhatsAppChatThreadRead(db: Firestore, threadId: string): Promise<void> {
  const id = normalizeChatPhone(threadId);
  if (!id) return;
  await db.collection(CHATS_COLLECTION).doc(id).set({ unreadCount: 0, updatedAt: new Date().toISOString() }, { merge: true });
}

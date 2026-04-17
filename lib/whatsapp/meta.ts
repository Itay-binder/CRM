import type { WhatsAppMetaConfig, WhatsAppTemplateRecord } from "@/lib/whatsapp/repo";
import { countBodyPlaceholders } from "@/lib/whatsapp/templateParams";
import { uploadMediaHandleFromUrl } from "@/lib/whatsapp/metaMediaUpload";

function graphBaseUrl(): string {
  return process.env.WHATSAPP_GRAPH_API_BASE?.trim() || "https://graph.facebook.com/v22.0";
}

type MetaTemplateCreateResponse = {
  id?: string;
  status?: string;
  category?: string;
};

type MetaMessageSendResponse = {
  messages?: Array<{ id?: string }>;
  error?: { message?: string };
};

type MetaTemplateComponent = {
  type?: string;
  format?: string;
  text?: string;
  url?: string;
  buttons?: Array<{ type?: string; text?: string; url?: string }>;
  example?: {
    body_text?: string[][];
  };
};

type MetaTemplateNode = {
  id?: string;
  name?: string;
  status?: string;
  category?: string;
  language?: string;
  components?: MetaTemplateComponent[];
};

async function callMeta<T>(
  path: string,
  token: string,
  init?: RequestInit
): Promise<T> {
  const base = graphBaseUrl().replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  const res = await fetch(`${base}${p}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message || `Meta request failed (${res.status})`);
  }
  return json;
}

function normalizeTemplateComponents(template: WhatsAppTemplateRecord): WhatsAppTemplateRecord {
  const hf = template.headerFormat ?? "NONE";
  const next = { ...template };
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

export async function submitTemplateToMeta(
  config: WhatsAppMetaConfig,
  template: WhatsAppTemplateRecord
): Promise<MetaTemplateCreateResponse> {
  const t = normalizeTemplateComponents(template);
  const components: Array<Record<string, unknown>> = [];

  const hf = t.headerFormat ?? "NONE";
  if (hf === "TEXT" && t.headerText?.trim()) {
    components.push({
      type: "HEADER",
      format: "TEXT",
      text: t.headerText.trim().slice(0, 60),
    });
  } else if (hf === "IMAGE" || hf === "VIDEO" || hf === "DOCUMENT") {
    const url = t.headerMediaUrl?.trim();
    if (!url) {
      throw new Error("חסר קישור מדיה לכותרת (HTTPS ציבורי).");
    }
    const appId = config.appId?.trim();
    if (!appId) {
      throw new Error("חסר App ID בהגדרות ווצאפ — נדרש להעלאת מדיה לאישור במטא.");
    }
    const handle = await uploadMediaHandleFromUrl(appId, config.systemUserToken, url, hf);
    components.push({
      type: "HEADER",
      format: hf,
      example: { header_handle: [handle] },
    });
  }

  const bodyExamples = t.exampleValues.map((v) => v.trim()).filter(Boolean);
  const slotCount = countBodyPlaceholders(t.bodyText);
  const row: string[] = [];
  for (let i = 0; i < slotCount; i++) {
    row.push(bodyExamples[i] ?? "דוגמה");
  }
  components.push({
    type: "BODY",
    text: t.bodyText,
    ...(row.length > 0 ? { example: { body_text: [row] } } : {}),
  });

  if (t.footerText?.trim()) {
    components.push({
      type: "FOOTER",
      text: t.footerText.trim().slice(0, 60),
    });
  }

  const buttons = t.buttonRows?.slice(0, 3) ?? [];
  if (buttons.length > 0) {
    const buttonsPayload = buttons.map((b) => {
      if (b.type === "URL") {
        const url = (b.url ?? "").trim() || "https://example.com";
        return { type: "URL", text: b.text, url };
      }
      return { type: "QUICK_REPLY", text: b.text };
    });
    components.push({ type: "BUTTONS", buttons: buttonsPayload });
  }

  return callMeta<MetaTemplateCreateResponse>(`/${config.wabaId}/message_templates`, config.systemUserToken, {
    method: "POST",
    body: JSON.stringify({
      name: t.name,
      category: t.category,
      language: t.language,
      components,
    }),
  });
}

export async function sendTemplateMessageViaMeta(
  config: WhatsAppMetaConfig,
  input: {
    to: string;
    template: WhatsAppTemplateRecord;
    bodyParameterValues: string[];
  }
): Promise<{ messageId?: string }> {
  const template = input.template;
  const templateComponents: Array<Record<string, unknown>> = [];

  const hf = template.headerFormat ?? "NONE";
  if (hf === "IMAGE" && template.headerMediaUrl?.trim()) {
    templateComponents.push({
      type: "header",
      parameters: [{ type: "image", image: { link: template.headerMediaUrl.trim() } }],
    });
  } else if (hf === "VIDEO" && template.headerMediaUrl?.trim()) {
    templateComponents.push({
      type: "header",
      parameters: [{ type: "video", video: { link: template.headerMediaUrl.trim() } }],
    });
  } else if (hf === "DOCUMENT" && template.headerMediaUrl?.trim()) {
    templateComponents.push({
      type: "header",
      parameters: [
        {
          type: "document",
          document: {
            link: template.headerMediaUrl.trim(),
            filename: "document",
          },
        },
      ],
    });
  }
  /* כותרת טקסט סטטית — חלק מהתבנית המאושרת; אין צורך ב־component בשליחה */

  const slots = countBodyPlaceholders(template.bodyText);
  const raw = input.bodyParameterValues.map((text) => String(text ?? "").trim());
  while (raw.length < slots) raw.push("");
  const bodyParameters = raw.slice(0, slots).map((text) => ({ type: "text", text }));
  if (slots > 0) {
    templateComponents.push({ type: "body", parameters: bodyParameters });
  }

  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: input.to,
    type: "template",
    template: {
      name: template.name,
      language: { code: template.language },
      ...(templateComponents.length > 0 ? { components: templateComponents } : {}),
    },
  };

  const res = await callMeta<MetaMessageSendResponse>(
    `/${config.phoneNumberId}/messages`,
    config.systemUserToken,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
  return { messageId: res.messages?.[0]?.id };
}

export type MetaTemplateSnapshot = {
  metaTemplateId: string;
  name: string;
  language: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  status: "draft" | "submitted" | "approved" | "rejected";
  metaStatus: string;
  rejectionReason?: string;
  bodyText: string;
  exampleValues: string[];
  headerFormat: "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  headerText?: string;
  footerText?: string;
  buttonRows?: Array<{ type: "QUICK_REPLY" | "URL"; text: string; url?: string }>;
};

type MetaTemplateListResponse = {
  data?: MetaTemplateNode[];
  paging?: { next?: string };
};

function mapMetaCategory(raw: string): "MARKETING" | "UTILITY" | "AUTHENTICATION" {
  const c = raw.trim().toUpperCase();
  if (c === "UTILITY" || c === "AUTHENTICATION") return c;
  return "MARKETING";
}

function mapMetaStatus(raw: string): "draft" | "submitted" | "approved" | "rejected" {
  const s = raw.trim().toUpperCase();
  if (s === "APPROVED") return "approved";
  if (s === "REJECTED") return "rejected";
  if (s === "PENDING" || s === "PENDING_DELETION" || s === "IN_APPEAL") return "submitted";
  return "draft";
}

function mapMetaHeaderFormat(raw: string): "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" {
  const f = raw.trim().toUpperCase();
  if (f === "TEXT" || f === "IMAGE" || f === "VIDEO" || f === "DOCUMENT") return f;
  return "NONE";
}

function mapMetaTemplateNode(node: MetaTemplateNode): MetaTemplateSnapshot | null {
  const metaTemplateId = (node.id ?? "").trim();
  const name = (node.name ?? "").trim();
  if (!metaTemplateId || !name) return null;
  const language = (node.language ?? "").trim() || "he";
  const metaStatus = (node.status ?? "").trim() || "UNKNOWN";
  const components = Array.isArray(node.components) ? node.components : [];
  const header = components.find((c) => String(c.type ?? "").toUpperCase() === "HEADER");
  const body = components.find((c) => String(c.type ?? "").toUpperCase() === "BODY");
  const footer = components.find((c) => String(c.type ?? "").toUpperCase() === "FOOTER");
  const buttonsComp = components.find((c) => String(c.type ?? "").toUpperCase() === "BUTTONS");

  const bodyText = (body?.text ?? "").trim();
  if (!bodyText) return null;
  const exampleValues = (body?.example?.body_text?.[0] ?? [])
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);
  const buttons: Array<{ type: "QUICK_REPLY" | "URL"; text: string; url?: string }> = [];
  for (const b of buttonsComp?.buttons ?? []) {
    const type = String(b.type ?? "").trim().toUpperCase();
    const text = String(b.text ?? "").trim().slice(0, 25);
    if (!text) continue;
    if (type === "URL") {
      const url = String(b.url ?? "").trim();
      if (!url) continue;
      buttons.push({ type: "URL", text, url });
    } else {
      buttons.push({ type: "QUICK_REPLY", text });
    }
    if (buttons.length >= 3) break;
  }

  const headerFormat = mapMetaHeaderFormat(String(header?.format ?? ""));

  return {
    metaTemplateId,
    name,
    language,
    category: mapMetaCategory(String(node.category ?? "")),
    status: mapMetaStatus(metaStatus),
    metaStatus,
    rejectionReason: node.status?.toUpperCase() === "REJECTED" ? "Meta rejected" : undefined,
    bodyText,
    exampleValues,
    headerFormat,
    headerText: headerFormat === "TEXT" ? (header?.text ?? "").trim().slice(0, 60) : undefined,
    footerText: (footer?.text ?? "").trim().slice(0, 60) || undefined,
    buttonRows: buttons.length ? buttons : undefined,
  };
}

async function fetchAbsoluteMeta<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message || `Meta request failed (${res.status})`);
  return json;
}

export async function listTemplatesFromMeta(config: WhatsAppMetaConfig): Promise<MetaTemplateSnapshot[]> {
  const fields = encodeURIComponent("id,name,status,category,language,components");
  let nextPath = `/${config.wabaId}/message_templates?fields=${fields}&limit=100`;
  let nextAbsoluteUrl = "";
  const out: MetaTemplateSnapshot[] = [];
  while (nextPath || nextAbsoluteUrl) {
    const page = nextAbsoluteUrl
      ? await fetchAbsoluteMeta<MetaTemplateListResponse>(nextAbsoluteUrl, config.systemUserToken)
      : await callMeta<MetaTemplateListResponse>(nextPath, config.systemUserToken);
    const rows = Array.isArray(page.data) ? page.data : [];
    for (const row of rows) {
      const mapped = mapMetaTemplateNode(row);
      if (mapped) out.push(mapped);
    }
    const next = page.paging?.next?.trim() ?? "";
    if (!next) break;
    nextPath = "";
    nextAbsoluteUrl = next;
  }
  return out;
}

export async function assertPhoneNumberBelongsToWaba(config: WhatsAppMetaConfig): Promise<void> {
  const info = await callMeta<{ whatsapp_business_account?: { id?: string } }>(
    `/${config.phoneNumberId}?fields=whatsapp_business_account`,
    config.systemUserToken
  );
  const got = info.whatsapp_business_account?.id?.trim() ?? "";
  if (!got) {
    throw new Error("Meta לא החזיר WABA עבור Phone Number ID. בדקו הרשאות טוקן וחיבור המספר.");
  }
  if (got !== config.wabaId.trim()) {
    throw new Error("Phone Number ID לא שייך ל־WABA שהוגדר במערכת. עדכנו מזהים תואמים.");
  }
}

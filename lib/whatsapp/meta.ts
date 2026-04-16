import type { WhatsAppMetaConfig, WhatsAppTemplateRecord } from "@/lib/whatsapp/repo";
import { countBodyPlaceholders } from "@/lib/whatsapp/templateParams";

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

export async function submitTemplateToMeta(
  config: WhatsAppMetaConfig,
  template: WhatsAppTemplateRecord
): Promise<MetaTemplateCreateResponse> {
  const bodyExamples = template.exampleValues.map((v) => v.trim()).filter(Boolean);
  const slotCount = countBodyPlaceholders(template.bodyText);
  const row: string[] = [];
  for (let i = 0; i < slotCount; i++) {
    row.push(bodyExamples[i] ?? "דוגמה");
  }
  const components: Array<Record<string, unknown>> = [
    {
      type: "BODY",
      text: template.bodyText,
      ...(row.length > 0 ? { example: { body_text: [row] } } : {}),
    },
  ];
  const buttons = template.buttonRows?.slice(0, 3) ?? [];
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
      name: template.name,
      category: template.category,
      language: template.language,
      components,
    }),
  });
}

export async function sendTemplateMessageViaMeta(
  config: WhatsAppMetaConfig,
  input: {
    to: string;
    templateName: string;
    language: string;
    parameterValues: string[];
  }
): Promise<{ messageId?: string }> {
  const bodyParameters = input.parameterValues
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({ type: "text", text }));
  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: input.to,
    type: "template",
    template: {
      name: input.templateName,
      language: { code: input.language },
      ...(bodyParameters.length > 0
        ? { components: [{ type: "body", parameters: bodyParameters }] }
        : {}),
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

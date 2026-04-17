import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { normalizePhone, setLeadWhatsAppMarketingApprovalByPhone } from "@/lib/leads/repo";
import { appendWhatsAppChatMessage } from "@/lib/whatsapp/repo";

export const dynamic = "force-dynamic";

type MetaWebhookMessage = {
  id?: string;
  from?: string;
  timestamp?: string | number;
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
};

type MetaWebhookValue = {
  metadata?: { display_phone_number?: string };
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
  messages?: MetaWebhookMessage[];
};

function extractInboundText(message: MetaWebhookMessage): string {
  const text = message.text?.body?.trim();
  if (text) return text;
  const button = message.button?.text?.trim();
  if (button) return button;
  const reply = message.interactive?.button_reply?.title?.trim();
  if (reply) return reply;
  const listReply = message.interactive?.list_reply?.title?.trim();
  if (listReply) return listReply;
  return "";
}

function isOptOutKeyword(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  return normalized === "הסר" || normalized === "remove" || normalized === "stop";
}

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() || "";
  if (mode === "subscribe" && token && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ ok: false, error: "Invalid webhook verify token" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  let body: {
    entry?: Array<{
      changes?: Array<{ value?: MetaWebhookValue }>;
    }>;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const db = await getAdminDb();
    const entries = Array.isArray(body.entry) ? body.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change.value;
        if (!value) continue;
        const messages = Array.isArray(value.messages) ? value.messages : [];
        const businessPhone = normalizePhone(value.metadata?.display_phone_number) ?? "";
        for (const msg of messages) {
          const from = normalizePhone(msg.from) ?? "";
          if (!from) continue;
          const text = extractInboundText(msg);
          const rawTs = msg.timestamp;
          const tsSec =
            typeof rawTs === "number" && Number.isFinite(rawTs)
              ? rawTs
              : typeof rawTs === "string" && /^\d+$/.test(rawTs.trim())
                ? Number.parseInt(rawTs.trim(), 10)
                : NaN;
          const ts = Number.isFinite(tsSec) ? new Date(tsSec * 1000).toISOString() : new Date().toISOString();
          const contacts = Array.isArray(value.contacts) ? value.contacts : [];
          const byWa = contacts.find((c) => (normalizePhone(c.wa_id) ?? "") === from);
          const fallback = contacts[0];
          const contactName = byWa?.profile?.name?.trim() || fallback?.profile?.name?.trim() || undefined;
          const byPhone = await db.collection("leads").where("phone", "==", from).limit(1).get();
          const leadId = byPhone.docs[0]?.id;
          let marketingApproved = byPhone.docs[0]?.data()?.customFields?.whatsappMarketingApproved !== false;

          if (text && isOptOutKeyword(text)) {
            const opt = await setLeadWhatsAppMarketingApprovalByPhone(from, false, "opt_out_keyword_he_ser");
            if (opt.updatedLeadIds.length > 0) marketingApproved = false;
          }

          await appendWhatsAppChatMessage(db, {
            phone: from,
            direction: "inbound",
            text: text || `[${msg.type || "message"}]`,
            from,
            to: businessPhone || "business",
            createdAt: ts,
            messageId: msg.id,
            contactId: leadId,
            contactName,
            marketingApproved,
          });
        }
      }
    }
    return NextResponse.json({ ok: true, received: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

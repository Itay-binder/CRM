import { randomUUID } from "crypto";
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import {
  ALL_WEBHOOK_EVENTS,
  WEBHOOK_EVENT_LABELS,
  type WebhookEventId,
  type WebhookTriggerRow,
} from "@/lib/webhooks/triggersTypes";

const COLLECTION = "integrationSettings";
const DOC_ID = "webhookTriggers";

export type { WebhookEventId, WebhookTriggerRow };
export { WEBHOOK_EVENT_LABELS, ALL_WEBHOOK_EVENTS };

const DEFAULT_MAKE =
  "https://hook.us1.make.com/y713jevs12gt2ge6uuh7j7180q3c6fey";

function envBaseUrl(): string {
  return process.env.CRM_TASK_WEBHOOK_URL?.trim() || DEFAULT_MAKE;
}

export function buildDefaultTriggers(): WebhookTriggerRow[] {
  const base = envBaseUrl();
  return [
    {
      id: "def-task-reminder-custom",
      label: "תזכורת משימה (ברירת מחדל)",
      event: "task_reminder_custom",
      enabled: true,
      url: base,
    },
    {
      id: "def-task-deadline-15m",
      label: "15 דק׳ לפני דדליין (ברירת מחדל)",
      event: "task_reminder_deadline_15m",
      enabled: true,
      url: base,
    },
    {
      id: "def-lead-created",
      label: "קליטת ליד",
      event: "lead_created",
      enabled: false,
      url: "",
    },
    {
      id: "def-lead-stage",
      label: "שינוי שלב איש קשר",
      event: "lead_stage_changed",
      enabled: false,
      url: "",
    },
    {
      id: "def-opp-created",
      label: "הזדמנות חדשה",
      event: "opportunity_created",
      enabled: false,
      url: "",
    },
    {
      id: "def-opp-stage",
      label: "שינוי שלב בהזדמנות",
      event: "opportunity_stage_changed",
      enabled: false,
      url: "",
    },
    {
      id: "def-opp-pipeline",
      label: "מעבר הזדמנות בין פייפליינים",
      event: "opportunity_pipeline_changed",
      enabled: false,
      url: "",
    },
    {
      id: "def-moving-order-dispatch",
      label: "שליחת הזמנת הובלה למובילים",
      event: "moving_order_dispatch",
      enabled: false,
      url: "",
    },
  ];
}

function isValidUrl(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseWebhookTriggers(raw: unknown): WebhookTriggerRow[] | null {
  if (!raw || typeof raw !== "object") return null;
  const triggers = (raw as { triggers?: unknown }).triggers;
  if (!Array.isArray(triggers)) return null;
  const events = new Set<string>(ALL_WEBHOOK_EVENTS);
  const out: WebhookTriggerRow[] = [];
  for (const row of triggers) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = String(o.id ?? "").trim();
    const event = String(o.event ?? "").trim() as WebhookEventId;
    if (!id || !events.has(event)) continue;
    const url = String(o.url ?? "").trim();
    if (!isValidUrl(url)) continue;
    out.push({
      id,
      label: String(o.label ?? "").trim() || WEBHOOK_EVENT_LABELS[event],
      event,
      enabled: Boolean(o.enabled),
      url,
    });
  }
  return out.length > 0 ? out : null;
}

export async function getWebhookTriggers(db: Firestore): Promise<WebhookTriggerRow[]> {
  const snap = await db.collection(COLLECTION).doc(DOC_ID).get();
  if (!snap.exists) return buildDefaultTriggers();
  const parsed = parseWebhookTriggers(snap.data());
  return parsed ?? buildDefaultTriggers();
}

export async function saveWebhookTriggers(
  db: Firestore,
  triggers: WebhookTriggerRow[]
): Promise<void> {
  const events = new Set<string>(ALL_WEBHOOK_EVENTS);
  for (const t of triggers) {
    if (!t.id?.trim()) throw new Error("כל טריגר חייב מזהה");
    if (!events.has(t.event)) throw new Error(`סוג אירוע לא חוקי: ${t.event}`);
    if (t.enabled && !t.url.trim()) {
      throw new Error(`טריגר מופעל חייב URL: ${t.label || t.id}`);
    }
    if (t.url.trim() && !isValidUrl(t.url)) throw new Error(`URL לא חוקי: ${t.label || t.id}`);
  }
  await db.collection(COLLECTION).doc(DOC_ID).set(
    {
      triggers,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export function newTriggerId(): string {
  return randomUUID();
}

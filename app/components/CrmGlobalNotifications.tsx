"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const PREFS_KEY = "liftygo_crm_notification_prefs";

export type CrmNotificationPrefs = {
  inAppWhatsApp: boolean;
  inAppNewLead: boolean;
  browserWhatsApp: boolean;
  browserNewLead: boolean;
};

export function saveCrmNotificationPrefs(p: CrmNotificationPrefs) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  window.dispatchEvent(new Event("liftygo-crm-prefs-updated"));
}

export function loadCrmNotificationPrefs(): CrmNotificationPrefs {
  if (typeof window === "undefined") {
    return {
      inAppWhatsApp: true,
      inAppNewLead: true,
      browserWhatsApp: false,
      browserNewLead: false,
    };
  }
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) {
      return {
        inAppWhatsApp: true,
        inAppNewLead: true,
        browserWhatsApp: false,
        browserNewLead: false,
      };
    }
    const j = JSON.parse(raw) as Partial<CrmNotificationPrefs>;
    return {
      inAppWhatsApp: j.inAppWhatsApp !== false,
      inAppNewLead: j.inAppNewLead !== false,
      browserWhatsApp: Boolean(j.browserWhatsApp),
      browserNewLead: Boolean(j.browserNewLead),
    };
  } catch {
    return {
      inAppWhatsApp: true,
      inAppNewLead: true,
      browserWhatsApp: false,
      browserNewLead: false,
    };
  }
}

type PollWa = {
  id: string;
  phone: string;
  contactName?: string;
  lastInboundAt: string | null;
  lastMessageAt: string;
};

type PollLead = { id: string; name: string; phone: string; createdAt: string };

type PollOk = {
  ok: true;
  whatsapp: PollWa[];
  latestLead: PollLead | null;
};

type InAppToast = {
  id: string;
  kind: "wa" | "lead";
  title: string;
  body: string;
  threadId?: string;
  leadId?: string;
};

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

function pushBrowserNotification(title: string, body: string, tag: string) {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag, dir: "rtl" });
  } catch {
    /* ignore */
  }
}

export default function CrmGlobalNotifications() {
  const router = useRouter();
  const [toasts, setToasts] = useState<InAppToast[]>([]);
  const initRef = useRef(false);
  const waBaselineRef = useRef<Map<string, string | null>>(new Map());
  const leadBaselineRef = useRef<{ id: string; createdAt: string }>({ id: "", createdAt: "" });
  const prefsRef = useRef(loadCrmNotificationPrefs());

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((t: Omit<InAppToast, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setToasts((prev) => [...prev, { ...t, id }].slice(-5));
    window.setTimeout(() => dismissToast(id), 14_000);
  }, [dismissToast]);

  const poll = useCallback(async () => {
    prefsRef.current = loadCrmNotificationPrefs();
    const prefs = prefsRef.current;
    const res = await fetch("/api/crm/notifications/poll", { credentials: "include", cache: "no-store" });
    if (res.status === 401) return;
    const j = await parseJson<PollOk | { ok: false; error?: string }>(res);
    if (!res.ok || !j.ok || !("whatsapp" in j)) return;

    const nextWaMap = new Map<string, string | null>(
      j.whatsapp.map((t) => [t.id, t.lastInboundAt ?? null])
    );

    if (!initRef.current) {
      waBaselineRef.current = nextWaMap;
      if (j.latestLead) {
        leadBaselineRef.current = { id: j.latestLead.id, createdAt: j.latestLead.createdAt };
      } else {
        leadBaselineRef.current = { id: "__none__", createdAt: "" };
      }
      initRef.current = true;
      return;
    }

    for (const t of j.whatsapp) {
      const prevInbound = waBaselineRef.current.get(t.id);
      const cur = t.lastInboundAt ?? null;
      if (cur && (!prevInbound || cur > prevInbound)) {
        const label = t.contactName?.trim() || t.phone;
        if (prefs.inAppWhatsApp) {
          addToast({
            kind: "wa",
            title: "הודעת וואטסאפ חדשה",
            body: `מספר: ${t.phone}${t.contactName ? ` · ${t.contactName}` : ""}`,
            threadId: t.id,
          });
        }
        if (prefs.browserWhatsApp) {
          pushBrowserNotification("הודעת וואטסאפ חדשה", `מ־${label}`, `wa-${t.id}-${cur}`);
        }
      }
    }
    waBaselineRef.current = nextWaMap;

    if (j.latestLead) {
      const prev = leadBaselineRef.current;
      if (j.latestLead.id !== prev.id) {
        if (prefs.inAppNewLead) {
          addToast({
            kind: "lead",
            title: "ליד חדש נכנס",
            body: `${j.latestLead.name || "ללא שם"} · ${j.latestLead.phone || "—"}`,
            leadId: j.latestLead.id,
          });
        }
        if (prefs.browserNewLead) {
          pushBrowserNotification(
            "ליד חדש ב־CRM",
            `${j.latestLead.name || "ללא שם"} · ${j.latestLead.phone || "—"}`,
            `lead-${j.latestLead.id}`
          );
        }
      }
      leadBaselineRef.current = { id: j.latestLead.id, createdAt: j.latestLead.createdAt };
    }
  }, [addToast]);

  useEffect(() => {
    const refresh = () => {
      prefsRef.current = loadCrmNotificationPrefs();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === PREFS_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("liftygo-crm-prefs-updated", refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("liftygo-crm-prefs-updated", refresh);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      void poll().catch(() => {});
    };
    tick();
    const ms = () => (document.visibilityState === "hidden" ? 45_000 : 12_000);
    let id = window.setInterval(tick, ms());
    const vis = () => {
      window.clearInterval(id);
      id = window.setInterval(tick, ms());
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [poll]);

  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        insetInlineEnd: 16,
        bottom: 16,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: 360,
        width: "calc(100vw - 32px)",
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          dir="rtl"
          style={{
            pointerEvents: "auto",
            background: "#fff",
            borderRadius: 12,
            boxShadow: "0 8px 28px rgba(0,0,0,0.12), 0 0 1px rgba(0,0,0,0.08)",
            border: "1px solid #e5e7eb",
            padding: "12px 14px",
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 14, color: "#111827" }}>{t.title}</div>
          <div style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.45 }}>{t.body}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "#f9fafb",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              סגור
            </button>
            {t.kind === "wa" && t.threadId ? (
              <button
                type="button"
                onClick={() => {
                  dismissToast(t.id);
                  router.push(`/whatsapp-automations/chats?thread=${encodeURIComponent(t.threadId!)}`);
                }}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                מעבר להודעה
              </button>
            ) : null}
            {t.kind === "lead" && t.leadId ? (
              <button
                type="button"
                onClick={() => {
                  dismissToast(t.id);
                  router.push(`/contacts?openContactId=${encodeURIComponent(t.leadId!)}`);
                }}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                מעבר לאיש קשר
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

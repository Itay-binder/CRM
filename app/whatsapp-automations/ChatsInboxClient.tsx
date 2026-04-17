"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const SESSION_MS = 24 * 60 * 60 * 1000;

type ChatMessage = {
  id: string;
  direction: "inbound" | "outbound";
  text: string;
  from: string;
  to: string;
  createdAt: string;
};

type ChatThread = {
  id: string;
  phone: string;
  contactName?: string;
  marketingApproved: boolean;
  lastInboundAt?: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  unreadCount: number;
  messages: ChatMessage[];
};

function sessionOpen(lastInboundIso?: string): boolean {
  if (!lastInboundIso?.trim()) return false;
  const t = new Date(lastInboundIso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < SESSION_MS;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

export default function ChatsInboxClient() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [active, setActive] = useState<ChatThread | null>(null);
  const [draftText, setDraftText] = useState("");
  const [sending, setSending] = useState(false);

  const loadThreads = useCallback(async () => {
    const res = await fetch("/api/whatsapp/chats", { credentials: "include", cache: "no-store" });
    if (res.status === 401) {
      window.location.href = `/login?returnTo=${encodeURIComponent("/whatsapp-automations/chats")}`;
      return;
    }
    const j = await parseJson<{ ok?: boolean; threads?: ChatThread[]; error?: string }>(res);
    if (!res.ok || !j.ok) throw new Error(j.error || "טעינת שיחות נכשלה");
    const list = j.threads ?? [];
    setThreads(list);
    setSelectedId((prev) => prev || list[0]?.id || "");
  }, []);

  const loadThread = useCallback(async (id: string) => {
    if (!id) {
      setActive(null);
      return;
    }
    const res = await fetch(`/api/whatsapp/chats?thread=${encodeURIComponent(id)}`, {
      credentials: "include",
      cache: "no-store",
    });
    const j = await parseJson<{ ok?: boolean; thread?: ChatThread; error?: string }>(res);
    if (!res.ok || !j.ok || !j.thread) throw new Error(j.error || "טעינת חלון שיחה נכשלה");
    setActive(j.thread);
    setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, unreadCount: 0 } : t)));
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        await loadThreads();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "שגיאה");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadThreads]);

  useEffect(() => {
    if (!selectedId) return;
    void loadThread(selectedId).catch((e) => setErr(e instanceof Error ? e.message : "שגיאה"));
  }, [selectedId, loadThread]);

  const selectedMeta = useMemo(() => threads.find((t) => t.id === selectedId) ?? null, [threads, selectedId]);

  const canSendFreeform = useMemo(() => {
    const inbound = active?.lastInboundAt ?? selectedMeta?.lastInboundAt;
    return sessionOpen(inbound);
  }, [active?.lastInboundAt, selectedMeta?.lastInboundAt]);

  async function sendMessage() {
    if (!selectedId || !draftText.trim()) return;
    setSending(true);
    setErr(null);
    try {
      const res = await fetch("/api/whatsapp/chats/send", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: selectedId, text: draftText.trim() }),
      });
      const j = await parseJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "שליחה נכשלה");
      setDraftText("");
      await loadThread(selectedId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שליחה נכשלה");
    } finally {
      setSending(false);
    }
  }

  if (loading) return <div style={{ color: "#6b7280" }}>טוען שיחות…</div>;

  return (
    <div>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: "#4b5563", lineHeight: 1.55 }}>
        תיבת צ׳אט מלאה של Meta (כולל היסטוריה מלאה) זמינה ב־{" "}
        <a
          href="https://business.facebook.com/latest/inbox/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#2563eb", fontWeight: 700 }}
        >
          Meta Business Suite → Inbox
        </a>
        . כאן נשמרות הודעות שעברו דרך ה־CRM וה־webhook — ודאו ש־<code style={{ fontSize: 12 }}>WHATSAPP_WEBHOOK_VERIFY_TOKEN</code> הוא{" "}
        <strong>מחרוזת סודית</strong> (כמו ב־Meta), לא כתובת ה־webhook.
      </p>
      {err ? (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b" }}>{err}</div>
      ) : null}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(260px, 340px) 1fr",
          gap: 12,
          alignItems: "stretch",
        }}
      >
        <aside style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #f1f5f9", fontWeight: 900 }}>שיחות</div>
          <div style={{ maxHeight: 620, overflow: "auto" }}>
            {threads.length === 0 ? (
              <div style={{ padding: 14, color: "#6b7280" }}>עדיין לא התקבלו התכתבויות.</div>
            ) : (
              threads.map((t) => {
                const activeRow = t.id === selectedId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    style={{
                      width: "100%",
                      textAlign: "right",
                      border: "none",
                      borderBottom: "1px solid #f8fafc",
                      background: activeRow ? "#f5f3ff" : "#fff",
                      padding: "10px 12px",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>
                      {t.contactName || t.phone}
                      {t.unreadCount > 0 ? (
                        <span style={{ marginInlineStart: 8, color: "#1d4ed8", fontWeight: 700, fontSize: 12 }}>
                          {t.unreadCount} חדש
                        </span>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }} dir="ltr">
                      {t.phone}
                    </div>
                    <div style={{ fontSize: 12, color: "#4b5563", marginTop: 4 }}>{t.lastMessagePreview || "—"}</div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #f1f5f9" }}>
            <div style={{ fontWeight: 900 }}>{selectedMeta?.contactName || selectedMeta?.phone || "בחר שיחה"}</div>
            <div style={{ fontSize: 12, color: "#6b7280" }} dir="ltr">
              {selectedMeta?.phone || ""}
            </div>
            {selectedMeta ? (
              <div style={{ marginTop: 6, fontSize: 12, color: selectedMeta.marketingApproved ? "#065f46" : "#b45309" }}>
                אישור דיוור (שיווק): {selectedMeta.marketingApproved ? "פעיל" : "לא פעיל"}
              </div>
            ) : null}
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: canSendFreeform ? "#065f46" : "#92400e",
                lineHeight: 1.45,
              }}
            >
              {canSendFreeform
                ? "חלון שירות Meta פעיל (~24 שעות מהודעת הלקוח האחרונה) — ניתן לשלוח טקסט חופשי."
                : "מחוץ לחלון השירות: שליחת טקסט חופשי דורשת שאיש הקשר שלח הודעה או ביצע אינטראקציה לאחרונה. אחרת השתמשו בתבנית מאושרת."}
            </div>
          </div>
          <div
            style={{
              minHeight: 360,
              maxHeight: 520,
              overflow: "auto",
              background: "#ece5dd",
              padding: 14,
            }}
          >
            {!active || active.messages.length === 0 ? (
              <div style={{ color: "#57534e", textAlign: "center", padding: 24 }}>אין הודעות להצגה.</div>
            ) : (
              active.messages.map((m) => {
                const outbound = m.direction === "outbound";
                return (
                  <div
                    key={m.id}
                    style={{
                      display: "flex",
                      justifyContent: outbound ? "flex-end" : "flex-start",
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "82%",
                        padding: "8px 10px 6px",
                        borderRadius: outbound ? "10px 10px 2px 10px" : "10px 10px 10px 2px",
                        background: outbound ? "#dcf8c6" : "#fff",
                        boxShadow: "0 1px 0.5px rgba(0,0,0,0.12)",
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.45,
                        fontSize: 14,
                        color: "#111",
                      }}
                    >
                      <div>{m.text || "—"}</div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#667085",
                          marginTop: 4,
                          textAlign: "end",
                        }}
                        dir="ltr"
                      >
                        {formatTime(m.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div style={{ borderTop: "1px solid #e5e7eb", padding: 12, background: "#fafafa" }}>
            <textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              placeholder={canSendFreeform ? "כתבו הודעה…" : "מחוץ לחלון שירות — לא ניתן לשלוח טקסט"}
              disabled={!canSendFreeform || sending || !selectedId}
              rows={3}
              style={{
                width: "100%",
                resize: "vertical",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                fontFamily: "inherit",
                fontSize: 14,
                marginBottom: 8,
                opacity: canSendFreeform ? 1 : 0.65,
              }}
            />
            <button
              type="button"
              disabled={!canSendFreeform || sending || !draftText.trim() || !selectedId}
              onClick={() => void sendMessage()}
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                border: "none",
                background: canSendFreeform && draftText.trim() ? "#25d366" : "#cbd5e1",
                color: "#fff",
                fontWeight: 800,
                cursor: canSendFreeform && draftText.trim() ? "pointer" : "not-allowed",
              }}
            >
              {sending ? "שולח…" : "שלח בווצאפ"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

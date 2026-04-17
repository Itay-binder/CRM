"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
  lastMessageAt: string;
  lastMessagePreview: string;
  unreadCount: number;
  messages: ChatMessage[];
};

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

export default function ChatsInboxClient() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [active, setActive] = useState<ChatThread | null>(null);

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

  if (loading) return <div style={{ color: "#6b7280" }}>טוען שיחות…</div>;

  return (
    <div>
      {err ? (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b" }}>{err}</div>
      ) : null}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "340px 1fr",
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
              <div style={{ marginTop: 6, fontSize: 12, color: selectedMeta.marketingApproved ? "#065f46" : "#b91c1c" }}>
                אישור דיוור: {selectedMeta.marketingApproved ? "פעיל" : "לא פעיל"}
              </div>
            ) : null}
          </div>
          <div style={{ minHeight: 420, maxHeight: 620, overflow: "auto", background: "#f8fafc", padding: 14 }}>
            {!active || active.messages.length === 0 ? (
              <div style={{ color: "#6b7280" }}>אין הודעות להצגה.</div>
            ) : (
              active.messages.map((m) => {
                const outbound = m.direction === "outbound";
                return (
                  <div
                    key={m.id}
                    style={{
                      display: "flex",
                      justifyContent: outbound ? "flex-start" : "flex-end",
                      marginBottom: 8,
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "78%",
                        padding: "8px 10px",
                        borderRadius: 10,
                        background: outbound ? "#dbeafe" : "#dcfce7",
                        border: "1px solid #e5e7eb",
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.45,
                        fontSize: 13,
                      }}
                    >
                      <div>{m.text || "—"}</div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }} dir="ltr">
                        {new Date(m.createdAt).toLocaleString("he-IL")}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

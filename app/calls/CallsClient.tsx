"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";
import {
  naiveLocalInputToStoredIso,
  utcIsoToJerusalemDatetimeLocal,
} from "@/lib/datetime/taskTimestamps";

type CallStatus = "pending" | "done" | "canceled";
type SalesCall = {
  id: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  repId: string;
  repName: string;
  note: string;
  scheduledAt: string | null;
  status: CallStatus;
  followUpOfId?: string | null;
  followUpId?: string | null;
  completedAt: string | null;
  completionNote?: string;
  createdAt: string | null;
  updatedAt: string | null;
};

type ContactOption = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

type TeamMember = {
  id: string;
  name: string;
  role: string;
};

type Tab = "today" | "manage";

function toLocalInput(iso: string | null | undefined): string {
  return utcIsoToJerusalemDatetimeLocal(String(iso ?? ""));
}
function fromLocalInput(v: string): string {
  return naiveLocalInputToStoredIso(v);
}

function israelYmd(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  try {
    return israelYmd(new Date(iso)) === israelYmd(new Date());
  } catch {
    return false;
  }
}

const STATUS_LABEL: Record<CallStatus, string> = {
  pending: "ממתינה",
  done: "בוצעה",
  canceled: "בוטלה",
};

const STATUS_BG: Record<CallStatus, string> = {
  pending: "#fef3c7",
  done: "#dcfce7",
  canceled: "#f3f4f6",
};
const STATUS_FG: Record<CallStatus, string> = {
  pending: "#92400e",
  done: "#166534",
  canceled: "#374151",
};

export default function CallsClient() {
  const [tab, setTab] = useState<Tab>("today");
  const [calls, setCalls] = useState<SalesCall[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filterRepId, setFilterRepId] = useState<string>("");

  // Create modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createNote, setCreateNote] = useState("");
  const [createScheduledAt, setCreateScheduledAt] = useState("");
  const [createRepId, setCreateRepId] = useState("");
  const [createContactId, setCreateContactId] = useState("");
  const [createContactQuery, setCreateContactQuery] = useState("");
  const [creating, setCreating] = useState(false);

  // Done / follow-up modal
  const [completing, setCompleting] = useState<SalesCall | null>(null);
  const [completionNote, setCompletionNote] = useState("");
  const [createFollowUp, setCreateFollowUp] = useState(true);
  const [followUpAt, setFollowUpAt] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [completing2, setCompleting2] = useState(false);

  const loadCalls = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/calls", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 401) {
        window.location.href = `/login?returnTo=${encodeURIComponent("/calls")}`;
        return;
      }
      if (res.status === 403) {
        window.location.href = `/pending?returnTo=${encodeURIComponent("/calls")}`;
        return;
      }
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        calls?: SalesCall[];
        error?: string;
      };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "טעינת שיחות נכשלה");
      setCalls(j.calls ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "טעינת שיחות נכשלה");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMembers = useCallback(async () => {
    try {
      const res = await fetch("/api/team-members", {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        members?: TeamMember[];
      };
      if (res.ok && j.ok) setMembers(j.members ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  const loadContacts = useCallback(async () => {
    try {
      const res = await fetch("/api/contacts", {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        rows?: Array<Record<string, string>>;
      };
      if (res.ok && j.ok && Array.isArray(j.rows)) {
        const list: ContactOption[] = j.rows
          .map((r) => ({
            id: String(r.id ?? "").trim(),
            name: String(r.name ?? "").trim(),
            email: String(r.email ?? "").trim(),
            phone: String(r.phone ?? "").trim(),
          }))
          .filter((c) => c.id);
        setContacts(list);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadCalls();
    void loadMembers();
    void loadContacts();
  }, [loadCalls, loadMembers, loadContacts]);

  useEffect(() => {
    if (!createOpen) {
      setCreateTitle("");
      setCreateNote("");
      setCreateScheduledAt("");
      setCreateRepId("");
      setCreateContactId("");
      setCreateContactQuery("");
    }
  }, [createOpen]);

  const visibleCalls = useMemo(() => {
    let list = calls;
    if (filterRepId.trim()) list = list.filter((c) => c.repId === filterRepId.trim());
    if (tab === "today") list = list.filter((c) => c.status === "pending" && isToday(c.scheduledAt));
    return list;
  }, [calls, filterRepId, tab]);

  const filteredContacts = useMemo(() => {
    const q = createContactQuery.trim().toLowerCase();
    if (!q) return contacts.slice(0, 30);
    return contacts
      .filter((c) =>
        [c.name, c.email, c.phone].some((v) => v.toLowerCase().includes(q))
      )
      .slice(0, 30);
  }, [contacts, createContactQuery]);

  async function submitCreate() {
    const cid = createContactId.trim();
    const rid = createRepId.trim();
    if (!cid) {
      setErr("יש לבחור איש קשר");
      return;
    }
    if (!rid) {
      setErr("יש לבחור נציג מהצוות");
      return;
    }
    setCreating(true);
    setErr(null);
    try {
      const sched = createScheduledAt.trim()
        ? fromLocalInput(createScheduledAt)
        : "";
      const res = await fetch("/api/calls", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: cid,
          repId: rid,
          note: createNote.trim(),
          scheduledAt: sched,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        call?: SalesCall;
        error?: string;
      };
      if (!res.ok || !j.ok || !j.call) {
        throw new Error(j.error ?? "יצירת שיחה נכשלה");
      }
      setCalls((arr) => [j.call!, ...arr]);
      setCreateOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "יצירת שיחה נכשלה");
    } finally {
      setCreating(false);
    }
  }

  function openComplete(call: SalesCall) {
    setCompleting(call);
    setCompletionNote("");
    setCreateFollowUp(true);
    setFollowUpAt("");
    setFollowUpNote("");
  }

  async function submitComplete() {
    if (!completing) return;
    setCompleting2(true);
    setErr(null);
    try {
      const res = await fetch(`/api/calls/${encodeURIComponent(completing.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "done",
          completionNote: completionNote.trim(),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        call?: SalesCall;
        error?: string;
      };
      if (!res.ok || !j.ok || !j.call) {
        throw new Error(j.error ?? "סימון השיחה נכשל");
      }
      setCalls((arr) => arr.map((c) => (c.id === j.call!.id ? j.call! : c)));

      if (createFollowUp) {
        const sched = followUpAt.trim() ? fromLocalInput(followUpAt) : "";
        const fu = await fetch("/api/calls", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactId: completing.contactId,
            repId: completing.repId,
            note: followUpNote.trim(),
            scheduledAt: sched,
            followUpOfId: completing.id,
          }),
        });
        const fj = (await fu.json().catch(() => ({}))) as {
          ok?: boolean;
          call?: SalesCall;
          error?: string;
        };
        if (fu.ok && fj.ok && fj.call) {
          setCalls((arr) => [fj.call!, ...arr]);
        } else if (!fu.ok || !fj.ok) {
          setErr(fj.error ?? "יצירת פולואפ נכשלה");
        }
      }
      setCompleting(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "סימון השיחה נכשל");
    } finally {
      setCompleting2(false);
    }
  }

  async function cancelCall(call: SalesCall) {
    if (!window.confirm("לבטל את השיחה?")) return;
    try {
      const res = await fetch(`/api/calls/${encodeURIComponent(call.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "canceled" }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        call?: SalesCall;
        error?: string;
      };
      if (!res.ok || !j.ok || !j.call) {
        throw new Error(j.error ?? "ביטול נכשל");
      }
      setCalls((arr) => arr.map((c) => (c.id === j.call!.id ? j.call! : c)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ביטול נכשל");
    }
  }

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>ניהול שיחות</h1>
        <span
          style={{
            background: "#e0f2fe",
            color: "#0c4a6e",
            borderRadius: 999,
            padding: "4px 10px",
            fontWeight: 800,
            fontSize: 12,
          }}
        >
          {`${visibleCalls.length} מוצגות · ${calls.length} סה"כ`}
        </span>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          style={{
            marginInlineStart: "auto",
            padding: "8px 14px",
            borderRadius: 999,
            border: "none",
            background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
            color: "#fff",
            fontWeight: 800,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          + צור שיחה חדשה
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {(
          [
            ["today", "שיחות להיום"],
            ["manage", "ניהול שיחות"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              border: tab === id ? "2px solid #6d28d9" : "1px solid #e5e7eb",
              background: tab === id ? "#f5f3ff" : "#fff",
              fontWeight: 800,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {label}
          </button>
        ))}

        <div style={{ marginInlineStart: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ color: "#6b7280", fontSize: 12 }}>סינון לפי נציג:</span>
          <select
            value={filterRepId}
            onChange={(e) => setFilterRepId(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
          >
            <option value="">כל הנציגים</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.role ? ` · ${m.role}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {err ? (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            padding: 10,
            borderRadius: 10,
            marginBottom: 12,
          }}
        >
          {err}
        </div>
      ) : null}
      {loading ? <div style={{ color: "#6b7280", fontWeight: 700 }}>טוען...</div> : null}

      <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f9fafb", textAlign: "right" }}>
              <th style={{ padding: 10, borderBottom: "1px solid #e5e7eb" }}>איש קשר</th>
              <th style={{ padding: 10, borderBottom: "1px solid #e5e7eb" }}>טלפון</th>
              <th style={{ padding: 10, borderBottom: "1px solid #e5e7eb" }}>נציג</th>
              <th style={{ padding: 10, borderBottom: "1px solid #e5e7eb" }}>תאריך לביצוע</th>
              <th style={{ padding: 10, borderBottom: "1px solid #e5e7eb" }}>סטטוס</th>
              <th style={{ padding: 10, borderBottom: "1px solid #e5e7eb" }}>הערה</th>
              <th style={{ padding: 10, borderBottom: "1px solid #e5e7eb" }}>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {visibleCalls.length === 0 && !loading ? (
              <tr>
                <td colSpan={7} style={{ padding: 14, color: "#6b7280", textAlign: "center" }}>
                  {tab === "today" ? "אין שיחות מתוכננות להיום" : "אין שיחות לפי הסינון שנבחר"}
                </td>
              </tr>
            ) : null}
            {visibleCalls.map((c) => (
              <tr key={c.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: 10, fontWeight: 700 }}>
                  <a
                    href={`/contacts?openContactId=${encodeURIComponent(c.contactId)}`}
                    style={{ color: "#4c1d95", fontWeight: 800 }}
                  >
                    {c.contactName || c.contactId}
                  </a>
                  {c.followUpOfId ? (
                    <span
                      style={{
                        marginInlineStart: 6,
                        fontSize: 11,
                        background: "#ede9fe",
                        color: "#5b21b6",
                        padding: "2px 6px",
                        borderRadius: 6,
                      }}
                    >
                      פולואפ
                    </span>
                  ) : null}
                </td>
                <td style={{ padding: 10, color: "#374151" }}>{c.contactPhone || "—"}</td>
                <td style={{ padding: 10 }}>{c.repName || "—"}</td>
                <td style={{ padding: 10 }}>
                  {c.scheduledAt ? formatIsraelDateTime(c.scheduledAt) : "—"}
                </td>
                <td style={{ padding: 10 }}>
                  <span
                    style={{
                      background: STATUS_BG[c.status],
                      color: STATUS_FG[c.status],
                      borderRadius: 999,
                      padding: "2px 10px",
                      fontWeight: 800,
                      fontSize: 12,
                    }}
                  >
                    {STATUS_LABEL[c.status]}
                  </span>
                </td>
                <td style={{ padding: 10, color: "#374151", maxWidth: 280, whiteSpace: "pre-wrap" }}>
                  {c.note || "—"}
                </td>
                <td style={{ padding: 10 }}>
                  {c.status === "pending" ? (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => openComplete(c)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: "none",
                          background: "#16a34a",
                          color: "#fff",
                          fontWeight: 800,
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        בוצעה
                      </button>
                      <button
                        type="button"
                        onClick={() => void cancelCall(c)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: "1px solid #e5e7eb",
                          background: "#fff",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        בטל
                      </button>
                    </div>
                  ) : (
                    <span style={{ color: "#9ca3af", fontSize: 12 }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {createOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(0,0,0,0.35)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
          onMouseDown={() => {
            if (creating) return;
            setCreateOpen(false);
          }}
        >
          <div
            style={{
              width: "min(520px, 96vw)",
              maxHeight: "92vh",
              overflow: "auto",
              background: "#fff",
              borderRadius: 16,
              border: "1px solid #e5e7eb",
              padding: 16,
              boxShadow: "0 20px 50px rgba(0,0,0,0.12)",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 900 }}>שיחה חדשה</h3>
            <div style={{ display: "grid", gap: 8 }}>
              <label style={{ fontWeight: 700, fontSize: 12 }}>שם השיחה (אופציונלי)</label>
              <input
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder="כותרת קצרה לשיחה"
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />

              <label style={{ fontWeight: 700, fontSize: 12 }}>נציג</label>
              <select
                value={createRepId}
                onChange={(e) => setCreateRepId(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              >
                <option value="">בחר נציג מהצוות</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.role ? ` · ${m.role}` : ""}
                  </option>
                ))}
              </select>
              {members.length === 0 ? (
                <p style={{ margin: 0, fontSize: 11, color: "#b91c1c" }}>
                  אין אנשי צוות במערכת. הוסף תחילה בהגדרות → ניהול צוות.
                </p>
              ) : null}

              <label style={{ fontWeight: 700, fontSize: 12 }}>איש קשר</label>
              <input
                value={createContactQuery}
                onChange={(e) => setCreateContactQuery(e.target.value)}
                placeholder="חיפוש לפי שם / אימייל / טלפון"
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  background: "#fafafa",
                  maxHeight: 180,
                  overflow: "auto",
                }}
              >
                {filteredContacts.length === 0 ? (
                  <div style={{ padding: 10, color: "#6b7280", fontSize: 12 }}>אין תוצאות</div>
                ) : (
                  filteredContacts.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCreateContactId(c.id)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "right",
                        padding: "8px 10px",
                        background: createContactId === c.id ? "#ede9fe" : "transparent",
                        border: "none",
                        borderBottom: "1px solid #f3f4f6",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      <div style={{ fontWeight: 800 }}>
                        {c.name || c.email || c.phone || c.id}
                      </div>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>
                        {[c.phone, c.email].filter(Boolean).join(" · ")}
                      </div>
                    </button>
                  ))
                )}
              </div>

              <label style={{ fontWeight: 700, fontSize: 12 }}>תאריך לביצוע</label>
              <input
                type="datetime-local"
                value={createScheduledAt}
                onChange={(e) => setCreateScheduledAt(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />

              <label style={{ fontWeight: 700, fontSize: 12 }}>הערה (אופציונלי)</label>
              <textarea
                value={createNote}
                onChange={(e) => setCreateNote(e.target.value)}
                placeholder="פרטים על השיחה..."
                style={{
                  minHeight: 90,
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  lineHeight: 1.5,
                }}
              />

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  disabled={creating || !createContactId.trim() || !createRepId.trim()}
                  onClick={() => void submitCreate()}
                  style={{
                    padding: "9px 14px",
                    borderRadius: 10,
                    border: "none",
                    background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
                    color: "#fff",
                    fontWeight: 800,
                    cursor: "pointer",
                    opacity:
                      creating || !createContactId.trim() || !createRepId.trim() ? 0.6 : 1,
                  }}
                >
                  {creating ? "שומר..." : "צור שיחה"}
                </button>
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => setCreateOpen(false)}
                  style={{
                    padding: "9px 14px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    cursor: "pointer",
                  }}
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {completing ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(0,0,0,0.35)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
          onMouseDown={() => {
            if (completing2) return;
            setCompleting(null);
          }}
        >
          <div
            style={{
              width: "min(520px, 96vw)",
              maxHeight: "92vh",
              overflow: "auto",
              background: "#fff",
              borderRadius: 16,
              border: "1px solid #e5e7eb",
              padding: 16,
              boxShadow: "0 20px 50px rgba(0,0,0,0.12)",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 900 }}>סימון שיחה כבוצעה</h3>
            <p style={{ margin: 0, color: "#374151", fontSize: 13 }}>
              <b>{completing.contactName || completing.contactId}</b> · {completing.repName}
            </p>

            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              <label style={{ fontWeight: 700, fontSize: 12 }}>סיכום שיחה (יישמר בפתקים של איש הקשר)</label>
              <textarea
                value={completionNote}
                onChange={(e) => setCompletionNote(e.target.value)}
                placeholder="מה סוכם בשיחה?"
                style={{
                  minHeight: 80,
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  lineHeight: 1.5,
                }}
              />

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 6,
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                <input
                  type="checkbox"
                  checked={createFollowUp}
                  onChange={(e) => setCreateFollowUp(e.target.checked)}
                />
                ליצור פולואפ?
              </label>

              {createFollowUp ? (
                <div
                  style={{
                    border: "1px solid #e9d5ff",
                    borderRadius: 12,
                    padding: 10,
                    background: "#faf5ff",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <label style={{ fontWeight: 700, fontSize: 12 }}>תאריך לפולואפ</label>
                  <input
                    type="datetime-local"
                    value={followUpAt}
                    onChange={(e) => setFollowUpAt(e.target.value)}
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                  />
                  <label style={{ fontWeight: 700, fontSize: 12 }}>הערות לפולואפ</label>
                  <textarea
                    value={followUpNote}
                    onChange={(e) => setFollowUpNote(e.target.value)}
                    placeholder="מה צריך לעשות בפולואפ הבא?"
                    style={{
                      minHeight: 70,
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #e5e7eb",
                      lineHeight: 1.5,
                    }}
                  />
                </div>
              ) : null}

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  disabled={completing2}
                  onClick={() => void submitComplete()}
                  style={{
                    padding: "9px 14px",
                    borderRadius: 10,
                    border: "none",
                    background: "linear-gradient(180deg, #4ade80 0%, #15803d 100%)",
                    color: "#fff",
                    fontWeight: 800,
                    cursor: "pointer",
                    opacity: completing2 ? 0.6 : 1,
                  }}
                >
                  {completing2 ? "שומר..." : "סמן כבוצעה"}
                </button>
                <button
                  type="button"
                  disabled={completing2}
                  onClick={() => setCompleting(null)}
                  style={{
                    padding: "9px 14px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    cursor: "pointer",
                  }}
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

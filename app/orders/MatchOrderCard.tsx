"use client";

import { useEffect, useState } from "react";
import { WhatsAppIconLink } from "@/app/components/InlineFieldShell";
import type {
  DriverSummary,
  MoverMatchEnrichment,
  MovingOrderRecord,
  MovingOrderStatus,
} from "@/lib/movingOrders/types";

function cardTitle(order: MovingOrderRecord): string {
  const cv = order.customValues ?? {};
  const fromCv = cv.moving_order_name ?? cv.moving_order_items_text;
  if (typeof fromCv === "string" && fromCv.trim()) return fromCv.trim().slice(0, 80);
  const pl = order.payload;
  const parts = [pl.items_text?.trim(), pl.move_type?.trim(), pl.name?.trim()].filter(Boolean);
  if (parts.length) return parts[0] as string;
  return pl.order_id || order.id;
}

function orderDisplayName(order: MovingOrderRecord): string {
  const cv = order.customValues ?? {};
  const n = cv.moving_order_name;
  if (typeof n === "string" && n.trim()) return n.trim();
  return order.payload.name?.trim() || cardTitle(order);
}

function moveDateLabel(order: MovingOrderRecord): string {
  const cv = order.customValues ?? {};
  const d = cv.moving_order_date;
  if (typeof d === "string" && d.trim()) return d.trim();
  if (typeof d === "number" && Number.isFinite(d)) return String(d);
  return order.payload.date?.trim() || "—";
}

function sortDriverIdsForMatch(order: MovingOrderRecord, ids: string[]): string[] {
  const rank = (id: string) => {
    const f = order.driverMatchFlags?.[id] ?? "ok";
    if (f === "red") return 2;
    if (f === "orange") return 1;
    return 0;
  };
  return [...ids].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function allMatchDriverIds(order: MovingOrderRecord): string[] {
  return sortDriverIdsForMatch(
    order,
    [...new Set([...order.matchedDriverIds, ...order.optionalDriverIds, ...order.manualDriverIds])]
  );
}

function matchRowAccent(flag: "ok" | "orange" | "red" | undefined): string {
  if (flag === "red") return "#fecaca";
  if (flag === "orange") return "#fdba74";
  return "transparent";
}

export function MatchOrderCard({
  order,
  drivers,
  enrichment,
  dispatching,
  isChecked,
  onToggleCheck,
  onSendMatch,
  onCancelMatch,
  onAddManual,
  statusLabel,
}: {
  order: MovingOrderRecord;
  drivers: Record<string, DriverSummary>;
  enrichment: Record<string, MoverMatchEnrichment>;
  dispatching: boolean;
  isChecked: (id: string) => boolean;
  onToggleCheck: (id: string, checked: boolean) => void;
  onSendMatch: () => void;
  onCancelMatch: (reason: string) => void;
  onAddManual: (contact: { id: string; name: string; phone: string; email: string }) => void;
  statusLabel: (s: MovingOrderStatus) => string;
}) {
  const [pickerQ, setPickerQ] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerRows, setPickerRows] = useState<Array<{ id: string; name: string; phone: string; email: string }>>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    if (!pickerOpen) return;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/moving-orders/customers?q=${encodeURIComponent(pickerQ)}`,
            { credentials: "include", cache: "no-store" }
          );
          const j = (await res.json()) as {
            ok?: boolean;
            contacts?: Array<{ id: string; name: string; phone: string; email: string }>;
          };
          if (j.ok && j.contacts) setPickerRows(j.contacts);
        } catch {
          setPickerRows([]);
        }
      })();
    }, 200);
    return () => window.clearTimeout(t);
  }, [pickerOpen, pickerQ]);

  const p = order.payload;
  const driverIds = allMatchDriverIds(order);

  function rowLabel(id: string): string {
    const d = drivers[id];
    const name = d?.name?.trim() || id;
    const phone = d?.phone?.trim();
    return phone ? `${name} · ${phone}` : name;
  }

  const canAct =
    order.status !== "cancelled" &&
    order.status !== "completed" &&
    order.status !== "rejected";

  const createdShort = order.createdAt
    ? order.createdAt.slice(0, 16).replace("T", " ")
    : "—";

  const actionBar = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
      <button
        type="button"
        disabled={!canAct || dispatching}
        onClick={onSendMatch}
        style={{
          padding: "10px 16px",
          borderRadius: 10,
          border: "none",
          background: canAct ? "#059669" : "#9ca3af",
          color: "#fff",
          fontWeight: 700,
          cursor: canAct && !dispatching ? "pointer" : "not-allowed",
        }}
      >
        {dispatching ? "שולח…" : "שלח הזמנה"}
      </button>
      <button
        type="button"
        disabled={!canAct}
        onClick={() => {
          setCancelReason("");
          setCancelOpen(true);
        }}
        style={{
          padding: "10px 16px",
          borderRadius: 10,
          border: "1px solid #fecaca",
          background: "#fff1f2",
          color: "#9f1239",
          fontWeight: 600,
          cursor: canAct ? "pointer" : "not-allowed",
        }}
      >
        בטל הזמנה
      </button>
    </div>
  );

  return (
    <>
      <article
        style={{
          padding: 18,
          borderRadius: 16,
          border: "1px solid #e5e7eb",
          background: "#fff",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        }}
      >
        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          style={{
            display: "block",
            padding: 0,
            marginBottom: 8,
            border: "none",
            background: "none",
            cursor: "pointer",
            fontWeight: 800,
            fontSize: 18,
            color: "#6d28d9",
            textAlign: "right",
            textDecoration: "underline",
          }}
        >
          {orderDisplayName(order)}
        </button>
        <div style={{ fontSize: 14, color: "#374151", marginBottom: 4 }}>
          <strong>תאריך יצירת ההזמנה:</strong> {createdShort}
        </div>
        <div style={{ fontSize: 14, color: "#374151", marginBottom: 4 }}>
          <strong>תאריך הובלה:</strong> {moveDateLabel(order)}
        </div>
        <div style={{ fontSize: 14, color: "#374151", marginBottom: 4 }}>
          <strong>סטטוס:</strong> {statusLabel(order.status)}
          {order.dispatchedAt ? (
            <span style={{ color: "#6b7280", fontWeight: 400 }}>
              {" "}
              · נשלח ב־{order.dispatchedAt.slice(0, 16).replace("T", " ")}
            </span>
          ) : null}
        </div>

        <div style={{ fontWeight: 700, fontSize: 14, margin: "14px 0 8px" }}>מובילים מתאימים</div>
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", display: "grid", gap: 6 }}>
          {driverIds.map((id) => {
            const driverPhone = drivers[id]?.phone?.trim();
            const flag = order.driverMatchFlags?.[id];
            return (
              <li
                key={id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  borderRadius: 8,
                  borderRight: `4px solid ${matchRowAccent(flag)}`,
                  background: flag === "red" ? "#fff5f5" : flag === "orange" ? "#fffbeb" : "transparent",
                }}
              >
                <input
                  type="checkbox"
                  checked={isChecked(id)}
                  disabled={!canAct}
                  onChange={(e) => onToggleCheck(id, e.target.checked)}
                />
                <span style={{ flex: 1 }}>{rowLabel(id)}</span>
                {driverPhone ? <WhatsAppIconLink phone={driverPhone} size={18} /> : null}
              </li>
            );
          })}
          {driverIds.length === 0 ? (
            <li style={{ color: "#6b7280" }}>
              לא נמצאו מובילים לאחר סינון אזורים (בדוק שדות הזמנה ומובילים).
            </li>
          ) : null}
        </ul>

        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "#f9fafb",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            + הוסף מוביל מלקוחות משלמים
          </button>
          {pickerOpen ? (
            <div
              style={{
                marginTop: 10,
                padding: 12,
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fafafa",
              }}
            >
              <input
                value={pickerQ}
                onChange={(e) => setPickerQ(e.target.value)}
                placeholder="חיפוש לפי שם / טלפון…"
                style={{
                  width: "100%",
                  maxWidth: 360,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                }}
              />
              <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0", maxHeight: 200, overflow: "auto" }}>
                {pickerRows.map((c) => (
                  <li key={c.id}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => {
                          onAddManual(c);
                          setPickerOpen(false);
                          setPickerQ("");
                        }}
                        style={{
                          flex: 1,
                          textAlign: "right",
                          padding: "8px 6px",
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          fontSize: 14,
                        }}
                      >
                        {c.name || c.id} {c.phone ? `· ${c.phone}` : ""}
                      </button>
                      {c.phone?.trim() ? <WhatsAppIconLink phone={c.phone} size={18} /> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {actionBar}
      </article>

      {detailOpen ? (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            zIndex: 50,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "24px 12px",
            overflow: "auto",
          }}
          onClick={() => setDetailOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setDetailOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            style={{
              width: "min(920px, 100%)",
              maxHeight: "90vh",
              overflow: "auto",
              background: "#fff",
              borderRadius: 16,
              padding: 20,
              marginTop: 12,
              boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>{orderDisplayName(order)}</h2>
                <div style={{ fontSize: 14, color: "#4b5563", lineHeight: 1.6 }}>
                  <div>
                    <strong>תאריך יצירה:</strong> {createdShort}
                  </div>
                  <div>
                    <strong>תאריך הובלה:</strong> {moveDateLabel(order)}
                  </div>
                  <div>
                    <strong>סטטוס:</strong> {statusLabel(order.status)}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                style={{
                  border: "none",
                  background: "#f3f4f6",
                  borderRadius: 8,
                  padding: "8px 12px",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                סגור
              </button>
            </div>

            <h3 style={{ fontSize: 15, margin: "18px 0 8px" }}>פרטי הזמנה</h3>
            <div
              style={{
                fontSize: 14,
                display: "grid",
                gap: 6,
                background: "#fafafa",
                padding: 12,
                borderRadius: 10,
                marginBottom: 16,
              }}
            >
              {p.pickup ? (
                <div>
                  <strong>איסוף:</strong> {p.pickup}
                </div>
              ) : null}
              {p.dropoff ? (
                <div>
                  <strong>פריקה:</strong> {p.dropoff}
                </div>
              ) : null}
              {p.name ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span>
                    <strong>לקוח:</strong> {p.name} {p.phone ? `· ${p.phone}` : ""}
                  </span>
                  {p.phone ? <WhatsAppIconLink phone={p.phone} size={18} /> : null}
                </div>
              ) : null}
              {p.move_type ? (
                <div>
                  <strong>סוג הובלה:</strong> {p.move_type}
                </div>
              ) : null}
              {p.notes ? (
                <div>
                  <strong>הערות:</strong> {p.notes}
                </div>
              ) : null}
            </div>

            <h3 style={{ fontSize: 15, margin: "0 0 8px" }}>מובילים</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f3f4f6", textAlign: "right" }}>
                    <th style={{ padding: 8, border: "1px solid #e5e7eb" }} />
                    <th style={{ padding: 8, border: "1px solid #e5e7eb" }}>שם</th>
                    <th style={{ padding: 8, border: "1px solid #e5e7eb" }}>אזורים</th>
                    <th style={{ padding: 8, border: "1px solid #e5e7eb" }}>זמינות</th>
                    <th style={{ padding: 8, border: "1px solid #e5e7eb" }}>ימים</th>
                    <th style={{ padding: 8, border: "1px solid #e5e7eb" }}>דירה</th>
                    <th style={{ padding: 8, border: "1px solid #e5e7eb" }}>קטנה</th>
                    <th style={{ padding: 8, border: "1px solid #e5e7eb" }}>SOS</th>
                    <th style={{ padding: 8, border: "1px solid #e5e7eb" }}>מנוף</th>
                    <th style={{ padding: 8, border: "1px solid #e5e7eb" }}>לידים</th>
                    <th style={{ padding: 8, border: "1px solid #e5e7eb" }}>ליד אחרון</th>
                    <th style={{ padding: 8, border: "1px solid #e5e7eb" }}>גמישות</th>
                    <th style={{ padding: 8, border: "1px solid #e5e7eb" }}>התחלה</th>
                    <th style={{ padding: 8, border: "1px solid #e5e7eb" }}>סיום</th>
                  </tr>
                </thead>
                <tbody>
                  {driverIds.map((id) => {
                    const en = enrichment[id];
                    const flag = order.driverMatchFlags?.[id];
                    return (
                      <tr
                        key={id}
                        style={{
                          background: flag === "red" ? "#fff5f5" : flag === "orange" ? "#fffbeb" : "#fff",
                        }}
                      >
                        <td style={{ padding: 6, border: "1px solid #e5e7eb", textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={isChecked(id)}
                            disabled={!canAct}
                            onChange={(e) => onToggleCheck(id, e.target.checked)}
                          />
                        </td>
                        <td style={{ padding: 6, border: "1px solid #e5e7eb" }}>{rowLabel(id)}</td>
                        <td style={{ padding: 6, border: "1px solid #e5e7eb" }}>{en?.regions ?? "—"}</td>
                        <td style={{ padding: 6, border: "1px solid #e5e7eb" }}>{en?.workAvailability ?? "—"}</td>
                        <td style={{ padding: 6, border: "1px solid #e5e7eb", whiteSpace: "pre-wrap" }}>
                          {en?.activityDays ?? "—"}
                        </td>
                        <td style={{ padding: 6, border: "1px solid #e5e7eb" }}>{en?.apartmentMover ?? "—"}</td>
                        <td style={{ padding: 6, border: "1px solid #e5e7eb" }}>{en?.smallMover ?? "—"}</td>
                        <td style={{ padding: 6, border: "1px solid #e5e7eb" }}>{en?.sos ?? "—"}</td>
                        <td style={{ padding: 6, border: "1px solid #e5e7eb" }}>{en?.crane ?? "—"}</td>
                        <td style={{ padding: 6, border: "1px solid #e5e7eb" }}>{en?.leadCount ?? "—"}</td>
                        <td style={{ padding: 6, border: "1px solid #e5e7eb" }}>
                          {en?.lastLeadAt ? en.lastLeadAt.slice(0, 16).replace("T", " ") : "—"}
                        </td>
                        <td style={{ padding: 6, border: "1px solid #e5e7eb" }}>{en?.flexibleHours ?? "—"}</td>
                        <td style={{ padding: 6, border: "1px solid #e5e7eb" }}>{en?.hourStart ?? "—"}</td>
                        <td style={{ padding: 6, border: "1px solid #e5e7eb" }}>{en?.hourEnd ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 16 }}>{actionBar}</div>
          </div>
        </div>
      ) : null}

      {cancelOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          role="presentation"
          onClick={() => setCancelOpen(false)}
        >
          <div
            role="dialog"
            style={{
              background: "#fff",
              borderRadius: 14,
              padding: 20,
              maxWidth: 420,
              width: "100%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 12px" }}>ביטול הזמנה</h3>
            <p style={{ margin: "0 0 8px", color: "#4b5563", fontSize: 14 }}>
              נא לתאר את סיבת הביטול (יישלח ל-webhook ויישמר בהזמנה).
            </p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={4}
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #d1d5db",
                fontFamily: "inherit",
                marginBottom: 12,
              }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setCancelOpen(false)}
                style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff" }}
              >
                סגור
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!cancelReason.trim()) {
                    alert("יש למלא סיבת ביטול");
                    return;
                  }
                  onCancelMatch(cancelReason.trim());
                  setCancelOpen(false);
                  setCancelReason("");
                }}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "none",
                  background: "#be123c",
                  color: "#fff",
                  fontWeight: 700,
                }}
              >
                אשר ביטול
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

"use client";

import { useState } from "react";
import { WhatsAppIconLink } from "@/app/components/InlineFieldShell";
import type {
  DriverSummary,
  MoverMatchEnrichment,
  MovingOrderRecord,
  MovingOrderStatus,
  OrderMatchUiHints,
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

function moveDateRaw(order: MovingOrderRecord): string {
  const cv = order.customValues ?? {};
  const d = cv.moving_order_date;
  if (typeof d === "string" && d.trim()) return d.trim();
  if (typeof d === "number" && Number.isFinite(d)) return String(d);
  return order.payload.date?.trim() || "";
}

function moveDateLabel(order: MovingOrderRecord, matchUi: OrderMatchUiHints | null | undefined): string {
  const raw = moveDateRaw(order);
  const base = raw || "—";
  const wd = matchUi?.moveWeekdayHe?.trim();
  if (!wd || base === "—") return wd && base === "—" ? `— · ${wd}` : base;
  if (base.includes(wd)) return base;
  return `${base} · ${wd}`;
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

function orderItemsBlock(order: MovingOrderRecord): string {
  const p = order.payload;
  const cv = order.customValues ?? {};
  const chunks: string[] = [];
  const fromCv = cv.moving_order_items_text;
  if (typeof fromCv === "string" && fromCv.trim()) chunks.push(fromCv.trim());
  const txt = p.items_text?.trim();
  if (txt) chunks.push(txt);
  const what = p.what_moving?.trim();
  if (what) chunks.push(what);
  const rawList = p.items_list?.trim();
  if (rawList) {
    try {
      const parsed = JSON.parse(rawList) as unknown;
      if (Array.isArray(parsed)) {
        chunks.push(
          parsed
            .map((x) => String(x).trim())
            .filter(Boolean)
            .join("\n")
        );
      } else {
        chunks.push(rawList);
      }
    } catch {
      chunks.push(rawList);
    }
  }
  return [...new Set(chunks)].join("\n\n").trim();
}

function flagLabelHe(flag: "ok" | "orange" | "red" | undefined): string {
  if (flag === "red") return "לא מתאים (אדום)";
  if (flag === "orange") return "התאמה חלקית (כתום)";
  return "מתאים (ירוק)";
}

export function MatchOrderCard({
  order,
  matchUi,
  drivers,
  enrichment,
  dispatching,
  isChecked,
  onToggleCheck,
  onSendMatch,
  onCancelMatch,
  onDelete,
  deleting,
  statusLabel,
  sentNow,
}: {
  order: MovingOrderRecord;
  matchUi?: OrderMatchUiHints | null;
  drivers: Record<string, DriverSummary>;
  enrichment: Record<string, MoverMatchEnrichment>;
  dispatching: boolean;
  deleting?: boolean;
  isChecked: (id: string) => boolean;
  onToggleCheck: (id: string, checked: boolean) => void;
  onSendMatch: () => void;
  onCancelMatch: (reason: string) => void;
  onDelete?: () => void;
  statusLabel: (s: MovingOrderStatus) => string;
  sentNow?: boolean;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const p = order.payload;
  const driverIds = allMatchDriverIds(order);
  const canAct = order.status !== "cancelled" && order.status !== "completed" && order.status !== "rejected";
  const createdShort = order.createdAt ? order.createdAt.slice(0, 16).replace("T", " ") : "—";

  function rowLabel(id: string): string {
    const d = drivers[id];
    const name = d?.name?.trim() || id;
    const phone = d?.phone?.trim();
    return phone ? `${name} · ${phone}` : name;
  }

  function issueList(id: string): string[] {
    return order.driverMatchIssues?.[id] ?? [];
  }

  function availabilityBlocked(id: string): boolean {
    return issueList(id).some((x) => x.includes("זמינות"));
  }

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
          <strong>תאריך הובלה:</strong> {moveDateLabel(order, matchUi)}
        </div>
        {matchUi?.transportRegionsLine ? (
          <div style={{ fontSize: 13, color: "#374151", marginBottom: 4, lineHeight: 1.45 }}>
            <strong>אזורי פעילות להובלה:</strong> {matchUi.transportRegionsLine}
          </div>
        ) : null}
        <div style={{ fontSize: 14, color: "#374151", marginBottom: 4 }}>
          <strong>סטטוס:</strong> {statusLabel(order.status)}
          {order.dispatchedAt ? (
            <span style={{ color: "#6b7280", fontWeight: 400 }}>
              {" "}
              · נשלח ב־{order.dispatchedAt.slice(0, 16).replace("T", " ")}
            </span>
          ) : null}
        </div>
        {sentNow ? (
          <div
            style={{
              margin: "6px 0 10px",
              display: "inline-block",
              background: "#ecfdf5",
              color: "#065f46",
              border: "1px solid #a7f3d0",
              borderRadius: 8,
              padding: "4px 10px",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            ההזמנה נשלחה בהצלחה
          </div>
        ) : null}

        <div style={{ fontWeight: 700, fontSize: 14, margin: "14px 0 8px" }}>מובילים (הזדמנויות · פייפליין לקוחות)</div>
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", display: "grid", gap: 6 }}>
          {driverIds.map((id) => {
            const driverPhone = drivers[id]?.phone?.trim();
            const flag = order.driverMatchFlags?.[id];
            const issues = issueList(id);
            const blocked = availabilityBlocked(id);
            return (
              <li
                key={id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "6px 8px",
                  borderRadius: 8,
                  borderRight: `4px solid ${matchRowAccent(flag)}`,
                  background: flag === "red" ? "#fff5f5" : flag === "orange" ? "#fffbeb" : "transparent",
                }}
              >
                <input
                  type="checkbox"
                  checked={!blocked && isChecked(id)}
                  disabled={!canAct || blocked}
                  onChange={(e) => onToggleCheck(id, e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span style={{ flex: 1 }}>
                  <span style={{ display: "block" }}>{rowLabel(id)}</span>
                  {issues.length ? (
                    <span style={{ display: "block", fontSize: 11, color: "#92400e", marginTop: 3, lineHeight: 1.35 }}>
                      {issues.join(" · ")}
                    </span>
                  ) : null}
                </span>
                {driverPhone ? <WhatsAppIconLink phone={driverPhone} size={18} /> : null}
              </li>
            );
          })}
          {driverIds.length === 0 ? <li style={{ color: "#6b7280" }}>אין מובילים מהפייפליין «לקוחות».</li> : null}
        </ul>

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
          {onDelete ? (
            <button
              type="button"
              disabled={Boolean(deleting)}
              onClick={onDelete}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#f9fafb",
                color: "#374151",
                fontWeight: 600,
                cursor: deleting ? "wait" : "pointer",
                opacity: deleting ? 0.75 : 1,
              }}
            >
              {deleting ? "מוחק…" : "מחק מהמערכת"}
            </button>
          ) : null}
        </div>
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
            <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>{orderDisplayName(order)}</h2>
            <div style={{ fontSize: 14, color: "#4b5563", lineHeight: 1.6 }}>
              <div><strong>תאריך יצירה:</strong> {createdShort}</div>
              <div><strong>תאריך הובלה:</strong> {moveDateLabel(order, matchUi)}</div>
            </div>
            <h3 style={{ fontSize: 15, margin: "18px 0 6px" }}>ערים ואזורי פעילות (לפי מפת הערים)</h3>
            <div
              style={{
                fontSize: 14,
                display: "grid",
                gap: 6,
                background: "#f0fdf4",
                padding: 12,
                borderRadius: 10,
                border: "1px solid #bbf7d0",
              }}
            >
              {matchUi?.pickupCity ? (
                <div>
                  <strong>עיר איסוף (מזוהה):</strong> {matchUi.pickupCity}
                </div>
              ) : p.pickup_city ? (
                <div>
                  <strong>עיר איסוף:</strong> {p.pickup_city}
                </div>
              ) : null}
              {matchUi?.dropCity ? (
                <div>
                  <strong>עיר פריקה (מזוהה):</strong> {matchUi.dropCity}
                </div>
              ) : p.dropoff_city ? (
                <div>
                  <strong>עיר פריקה:</strong> {p.dropoff_city}
                </div>
              ) : null}
              {matchUi?.transportRegionsLine ? (
                <div>
                  <strong>אזורי פעילות במפה להובלה זו:</strong> {matchUi.transportRegionsLine}
                </div>
              ) : (
                <div style={{ color: "#6b7280" }}>לא זוהו אזורים — הוזן כתובת חופשית בלבד.</div>
              )}
            </div>
            <h3 style={{ fontSize: 15, margin: "18px 0 6px" }}>מה מובילים (רשימת פריטים / תכולה)</h3>
            <div
              style={{
                fontSize: 14,
                whiteSpace: "pre-wrap",
                lineHeight: 1.55,
                background: "#fafafa",
                padding: 12,
                borderRadius: 10,
                border: "1px solid #e5e7eb",
              }}
            >
              {orderItemsBlock(order) || "—"}
            </div>
            <h3 style={{ fontSize: 15, margin: "18px 0 8px" }}>פרטי הזמנה</h3>
            <div style={{ fontSize: 14, display: "grid", gap: 6, background: "#fafafa", padding: 12, borderRadius: 10 }}>
              {p.pickup ? <div><strong>איסוף:</strong> {p.pickup}</div> : null}
              {p.dropoff ? <div><strong>פריקה:</strong> {p.dropoff}</div> : null}
              {p.move_type ? <div><strong>סוג הובלה:</strong> {p.move_type}</div> : null}
              {p.phone ? <div><strong>טלפון לקוח:</strong> {p.phone}</div> : null}
            </div>
            <h3 style={{ fontSize: 15, margin: "18px 0 8px" }}>מובילים — פירוט התאמה</h3>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
              {driverIds.map((id) => {
                const rowPhone = drivers[id]?.phone?.trim();
                const flag = order.driverMatchFlags?.[id];
                const en = enrichment[id];
                const issues = issueList(id);
                const oppId = en?.opportunityId?.trim();
                return (
                  <li
                    key={id}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                      padding: 12,
                      background: "#fff",
                      borderRight: `4px solid ${matchRowAccent(flag)}`,
                    }}
                  >
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>{rowLabel(id)}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>{flagLabelHe(flag)}</div>
                    {issues.length ? (
                      <div style={{ fontSize: 12, color: "#92400e", marginBottom: 8 }}>{issues.join(" · ")}</div>
                    ) : null}
                    {en ? (
                      <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.5, display: "grid", gap: 4 }}>
                        <div>
                          <strong>אזורי פעילות (מוביל):</strong> {en.regions?.trim() || "—"}
                        </div>
                        <div>
                          <strong>זמינות לעבודה:</strong> {en.workAvailability?.trim() || "—"}
                        </div>
                        <div>
                          <strong>ימי פעילות:</strong> {en.activityDays?.trim() || "—"}
                        </div>
                        <div>
                          <strong>דירות / קטן / חירום / מנוף:</strong>{" "}
                          {en.apartmentMover?.trim() || "—"} · {en.smallMover?.trim() || "—"} ·{" "}
                          {en.sos?.trim() || "—"} · {en.crane?.trim() || "—"}
                        </div>
                        <div>
                          <strong>מספר פניות (לידים):</strong> {en.leadCount ?? "—"}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: "#9ca3af" }}>אין נתוני התאמה נטענים.</div>
                    )}
                    {oppId ? (
                      <div style={{ marginTop: 10 }}>
                        <a
                          href={`/pipeline?openOpportunityId=${encodeURIComponent(oppId)}`}
                          style={{
                            display: "inline-block",
                            fontSize: 13,
                            fontWeight: 700,
                            color: "#6d28d9",
                            textDecoration: "underline",
                          }}
                        >
                          פתח הזדמנות במסך הפייפליין
                        </a>
                      </div>
                    ) : null}
                    {rowPhone ? (
                      <div style={{ marginTop: 8 }}>
                        <WhatsAppIconLink phone={rowPhone} size={18} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <div style={{ marginTop: 16, textAlign: "left" }}>
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff" }}
              >
                סגור
              </button>
            </div>
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
            style={{ background: "#fff", borderRadius: 14, padding: 20, maxWidth: 420, width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 12px" }}>ביטול הזמנה</h3>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={4}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #d1d5db", marginBottom: 12 }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setCancelOpen(false)} style={{ padding: "8px 14px" }}>סגור</button>
              <button
                type="button"
                onClick={() => {
                  if (!cancelReason.trim()) return;
                  onCancelMatch(cancelReason.trim());
                  setCancelOpen(false);
                  setCancelReason("");
                }}
                style={{ padding: "8px 14px", background: "#be123c", color: "#fff", border: "none", borderRadius: 8 }}
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

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

function ManualMoverPickerBlock({
  canPick,
  pickerOpen,
  onToggleOpen,
  pickerRows,
  pickerLoading,
  onPickContact,
  filterLocal,
  onFilterLocal,
  selectKey,
  resolvedPayingPipeline,
}: {
  canPick: boolean;
  pickerOpen: boolean;
  onToggleOpen: () => void;
  pickerRows: Array<{ id: string; name: string; phone: string; email: string }>;
  pickerLoading: boolean;
  onPickContact: (c: { id: string; name: string; phone: string; email: string }) => void;
  filterLocal: string;
  onFilterLocal: (v: string) => void;
  selectKey: number;
  resolvedPayingPipeline: { id: string; name: string } | null;
}) {
  const q = filterLocal.trim().toLowerCase();
  const displayRows = q
    ? pickerRows.filter((c) =>
        `${c.name ?? ""} ${c.phone ?? ""} ${c.email ?? ""}`.toLowerCase().includes(q)
      )
    : pickerRows;

  return (
    <div style={{ marginBottom: 12 }}>
      <button
        type="button"
        disabled={!canPick}
        onClick={onToggleOpen}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid #d1d5db",
          background: "#f9fafb",
          fontWeight: 600,
          cursor: canPick ? "pointer" : "not-allowed",
          fontSize: 13,
          opacity: canPick ? 1 : 0.6,
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
          <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
            בחירת איש קשר — פייפליין «{resolvedPayingPipeline?.name ?? "…"}»
          </label>
          {resolvedPayingPipeline ? (
            <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 8px", lineHeight: 1.4 }}>
              רשימה ממזהה <code dir="ltr">{resolvedPayingPipeline.id}</code> — הזדמנויות «לקוחות».
            </p>
          ) : null}
          {pickerLoading ? (
            <p style={{ color: "#6b7280", margin: 0 }}>טוען רשימה…</p>
          ) : pickerRows.length === 0 ? (
            <p style={{ color: "#6b7280", margin: 0, lineHeight: 1.5 }}>
              אין אנשי קשר שמקושרים להזדמנות בפייפליין «לקוחות». ודאו שלכל הזדמנות יש איש קשר תקין.
            </p>
          ) : (
            <>
              <input
                value={filterLocal}
                onChange={(e) => onFilterLocal(e.target.value)}
                placeholder="צמצום מקומי לפי שם / טלפון (אופציונלי)"
                style={{
                  width: "100%",
                  maxWidth: 480,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  marginBottom: 10,
                }}
              />
              <select
                key={selectKey}
                dir="rtl"
                aria-label="בחירת מוביל מהרשימה"
                disabled={!canPick}
                defaultValue=""
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) return;
                  const c = displayRows.find((x) => x.id === id) ?? pickerRows.find((x) => x.id === id);
                  if (c) onPickContact(c);
                }}
                style={{
                  width: "100%",
                  maxWidth: 480,
                  padding: "10px 8px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  fontSize: 14,
                  background: "#fff",
                }}
                size={Math.min(14, Math.max(4, displayRows.length + 1))}
              >
                <option value="">— בחר מוביל מהרשימה ({displayRows.length}) —</option>
                {displayRows.map((c) => (
                  <option key={c.id} value={c.id}>
                    {(c.name || c.id).trim()}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
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
  onRematchDrivers,
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
  onRematchDrivers?: () => void | Promise<void>;
  statusLabel: (s: MovingOrderStatus) => string;
}) {
  const [pickerFilterLocal, setPickerFilterLocal] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerRows, setPickerRows] = useState<Array<{ id: string; name: string; phone: string; email: string }>>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSelectKey, setPickerSelectKey] = useState(0);
  const [pickerPipelineMeta, setPickerPipelineMeta] = useState<{ id: string; name: string } | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    if (!pickerOpen) return;
    setPickerLoading(true);
    setPickerPipelineMeta(null);
    void (async () => {
      try {
        const res = await fetch(`/api/moving-orders/customers?forManualPick=1`, {
          credentials: "include",
          cache: "no-store",
        });
        const j = (await res.json()) as {
          ok?: boolean;
          contacts?: Array<{ id: string; name: string; phone: string; email: string }>;
          payingPipelineId?: string;
          payingPipelineName?: string;
        };
        if (j.ok && j.contacts) {
          setPickerRows(j.contacts);
          if (j.payingPipelineId)
            setPickerPipelineMeta({
              id: j.payingPipelineId,
              name: j.payingPipelineName ?? j.payingPipelineId,
            });
        } else {
          setPickerRows([]);
        }
      } catch {
        setPickerRows([]);
      } finally {
        setPickerLoading(false);
      }
    })();
  }, [pickerOpen]);

  function pickManualContact(c: { id: string; name: string; phone: string; email: string }) {
    onAddManual(c);
    setPickerOpen(false);
    setPickerFilterLocal("");
    setPickerSelectKey((k) => k + 1);
  }

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

        <div style={{ fontWeight: 700, fontSize: 14, margin: "14px 0 8px" }}>מובילים (הזדמנויות · פייפליין לקוחות)</div>
        <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 10px", lineHeight: 1.5 }}>
          מוצגים <strong>כל</strong> המובילים מההזדמנויות בפייפליין «לקוחות». רקע וימין: <span style={{ color: "#b45309" }}>כתום</span> — חריגה
          קלה; <span style={{ color: "#b91c1c" }}>אדום</span> — חריגה חמורה (למשל אזור או לא פעיל). מתחת לשם מופיע פירוט קצר.
        </p>
        {onRematchDrivers && canAct ? (
          <div style={{ marginBottom: 10 }}>
            <button
              type="button"
              onClick={() => void onRematchDrivers()}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid #c4b5fd",
                background: "#f5f3ff",
                color: "#5b21b6",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              חשב מובילים מחדש (אחרי עדכון ב-CRM)
            </button>
          </div>
        ) : null}
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", display: "grid", gap: 6 }}>
          {driverIds.map((id) => {
            const driverPhone = drivers[id]?.phone?.trim();
            const flag = order.driverMatchFlags?.[id];
            const issues = order.driverMatchIssues?.[id];
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
                  checked={isChecked(id)}
                  disabled={!canAct}
                  onChange={(e) => onToggleCheck(id, e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span style={{ flex: 1 }}>
                  <span style={{ display: "block" }}>{rowLabel(id)}</span>
                  {issues?.length ? (
                    <span style={{ display: "block", fontSize: 11, color: "#92400e", marginTop: 3, lineHeight: 1.35 }}>
                      {issues.join(" · ")}
                    </span>
                  ) : null}
                </span>
                {driverPhone ? <WhatsAppIconLink phone={driverPhone} size={18} /> : null}
              </li>
            );
          })}
          {driverIds.length === 0 ? (
            <li style={{ color: "#6b7280" }}>
              אין מובילים מהפייפליין «לקוחות». ודאו שיש הזדמנויות עם איש קשר, ולחצו «חשב מובילים מחדש».
            </li>
          ) : null}
        </ul>

        <ManualMoverPickerBlock
          canPick={canAct}
          pickerOpen={pickerOpen}
          onToggleOpen={() => setPickerOpen((v) => !v)}
          pickerRows={pickerRows}
          pickerLoading={pickerLoading}
          onPickContact={pickManualContact}
          filterLocal={pickerFilterLocal}
          onFilterLocal={setPickerFilterLocal}
          selectKey={pickerSelectKey}
          resolvedPayingPipeline={pickerPipelineMeta}
        />

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
            {onRematchDrivers && canAct ? (
              <div style={{ marginBottom: 10 }}>
                <button
                  type="button"
                  onClick={() => void onRematchDrivers()}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid #c4b5fd",
                    background: "#f5f3ff",
                    color: "#5b21b6",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  חשב מובילים מחדש
                </button>
              </div>
            ) : null}
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
                  {driverIds.length === 0 ? (
                    <tr>
                      <td
                        colSpan={14}
                        style={{ padding: 16, textAlign: "center", color: "#4b5563", background: "#fafafa" }}
                      >
                        אין מובילים מהפייפליין «לקוחות». השתמשו ב־«הוסף מוביל» או לחצו «חשב מובילים מחדש».
                      </td>
                    </tr>
                  ) : (
                    driverIds.map((id) => {
                      const en = enrichment[id];
                      const flag = order.driverMatchFlags?.[id];
                      const issues = order.driverMatchIssues?.[id];
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
                          <td style={{ padding: 6, border: "1px solid #e5e7eb", maxWidth: 220 }}>
                            <div>{rowLabel(id)}</div>
                            {issues?.length ? (
                              <div style={{ fontSize: 11, color: "#92400e", marginTop: 4, lineHeight: 1.35 }}>
                                {issues.join(" · ")}
                              </div>
                            ) : null}
                          </td>
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
                    })
                  )}
                </tbody>
              </table>
            </div>

            <ManualMoverPickerBlock
              canPick={canAct}
              pickerOpen={pickerOpen}
              onToggleOpen={() => setPickerOpen((v) => !v)}
              pickerRows={pickerRows}
              pickerLoading={pickerLoading}
              onPickContact={pickManualContact}
              filterLocal={pickerFilterLocal}
              onFilterLocal={setPickerFilterLocal}
              selectKey={pickerSelectKey}
              resolvedPayingPipeline={pickerPipelineMeta}
            />

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

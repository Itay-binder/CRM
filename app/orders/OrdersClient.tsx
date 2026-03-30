"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { WhatsAppIconLink } from "@/app/components/InlineFieldShell";
import OrdersBoardTab from "@/app/orders/OrdersBoardTab";
import OrdersPipelinesTab from "@/app/orders/OrdersPipelinesTab";
import type { DriverSummary } from "@/lib/movingOrders/types";
import type { MovingOrderRecord, MovingOrderStatus } from "@/lib/movingOrders/types";

type TabId = "match" | "board" | "pipelines";

type ApiListOk = {
  ok: true;
  orders: MovingOrderRecord[];
  drivers: Record<string, DriverSummary>;
};
type ApiListErr = { ok: false; error?: string };
type ApiListResponse = ApiListOk | ApiListErr;

function statusLabel(s: MovingOrderStatus): string {
  switch (s) {
    case "pending":
      return "ממתינה לביצוע";
    case "dispatched":
      return "נשלחה למובילים";
    case "completed":
      return "בוצעה";
    case "cancelled":
      return "בוטלה";
    default:
      return s;
  }
}

export default function OrdersClient() {
  const [tab, setTab] = useState<TabId>("match");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [orders, setOrders] = useState<MovingOrderRecord[]>([]);
  const [drivers, setDrivers] = useState<Record<string, DriverSummary>>({});
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [orderSeedMsg, setOrderSeedMsg] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/moving-orders", { credentials: "include", cache: "no-store" });
      const j = (await res.json()) as ApiListResponse;
      if (!res.ok || !j.ok) {
        setErr(!j.ok ? j.error ?? "שגיאה" : "שגיאה");
        return;
      }
      setOrders(j.orders);
      setDrivers(j.drivers);
    } catch {
      setErr("שגיאה בטעינה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function seedMoverFields() {
    setSeedMsg(null);
    try {
      const res = await fetch("/api/moving-orders/seed-fields", {
        method: "POST",
        credentials: "include",
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; fieldIds?: string[] };
      if (!res.ok || !j.ok) {
        setSeedMsg(j.error ?? "נכשל");
        return;
      }
      setSeedMsg(`נוצרו/עודכנו ${j.fieldIds?.length ?? 0} שדות מוביל.`);
    } catch {
      setSeedMsg("שגיאה");
    }
  }

  async function seedOrderFields() {
    setOrderSeedMsg(null);
    try {
      const res = await fetch("/api/moving-orders/seed-order-fields", {
        method: "POST",
        credentials: "include",
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; fieldIds?: string[] };
      if (!res.ok || !j.ok) {
        setOrderSeedMsg(j.error ?? "נכשל");
        return;
      }
      setOrderSeedMsg(`נוצרו/עודכנו ${j.fieldIds?.length ?? 0} שדות הזמנה.`);
    } catch {
      setOrderSeedMsg("שגיאה");
    }
  }

  function isChecked(order: MovingOrderRecord, leadId: string): boolean {
    return !order.excludedDriverIds.includes(leadId);
  }

  async function setExcluded(order: MovingOrderRecord, leadId: string, checked: boolean) {
    const ex = new Set(order.excludedDriverIds);
    if (checked) ex.delete(leadId);
    else ex.add(leadId);
    const excludedDriverIds = [...ex];
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, excludedDriverIds } : o)));
    try {
      const res = await fetch(`/api/moving-orders/${encodeURIComponent(order.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludedDriverIds }),
      });
      const j = (await res.json()) as { ok?: boolean; order?: MovingOrderRecord };
      if (res.ok && j.ok && j.order) {
        setOrders((prev) => prev.map((o) => (o.id === order.id ? j.order! : o)));
      }
    } catch {
      void load();
    }
  }

  async function addManualDriver(
    order: MovingOrderRecord,
    contact: { id: string; name: string; phone: string; email: string }
  ) {
    const contactId = contact.id;
    if (!contactId || order.manualDriverIds.includes(contactId)) return;
    const manualDriverIds = [...order.manualDriverIds, contactId];
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, manualDriverIds } : o)));
    try {
      const res = await fetch(`/api/moving-orders/${encodeURIComponent(order.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualDriverIds }),
      });
      const j = (await res.json()) as { ok?: boolean; order?: MovingOrderRecord };
      if (res.ok && j.ok && j.order) {
        setOrders((prev) => prev.map((o) => (o.id === order.id ? j.order! : o)));
        setDrivers((d) => ({
          ...d,
          [contactId]: {
            id: contactId,
            name: contact.name,
            phone: contact.phone,
            email: contact.email,
          },
        }));
      }
    } catch {
      void load();
    }
  }

  async function patchStatus(order: MovingOrderRecord, status: MovingOrderStatus) {
    try {
      const res = await fetch(`/api/moving-orders/${encodeURIComponent(order.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const j = (await res.json()) as { ok?: boolean; order?: MovingOrderRecord };
      if (res.ok && j.ok && j.order) {
        setOrders((prev) => prev.map((o) => (o.id === order.id ? j.order! : o)));
      }
    } catch {
      void load();
    }
  }

  async function dispatch(order: MovingOrderRecord) {
    const all = [
      ...new Set([...order.matchedDriverIds, ...order.optionalDriverIds, ...order.manualDriverIds]),
    ];
    const driverIds = all.filter((id) => !order.excludedDriverIds.includes(id));
    setDispatching(order.id);
    try {
      const res = await fetch(`/api/moving-orders/${encodeURIComponent(order.id)}/dispatch`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverIds }),
      });
      const j = (await res.json()) as { ok?: boolean; order?: MovingOrderRecord; error?: string };
      if (!res.ok || !j.ok) {
        alert(j.error ?? "שליחה נכשלה");
        return;
      }
      if (j.order) {
        setOrders((prev) => prev.map((o) => (o.id === order.id ? j.order! : o)));
      }
    } catch {
      alert("שגיאת רשת");
    } finally {
      setDispatching(null);
    }
  }

  const sorted = useMemo(
    () =>
      [...orders].sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      }),
    [orders]
  );

  const tabBtn = (id: TabId, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      style={{
        padding: "10px 16px",
        borderRadius: 999,
        border: tab === id ? "2px solid #6d28d9" : "1px solid #e5e7eb",
        background: tab === id ? "#f5f3ff" : "#fff",
        fontWeight: 800,
        cursor: "pointer",
        fontSize: 14,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ maxWidth: 1200 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: "0 0 6px", fontSize: 26 }}>ניהול הזמנות</h1>
          <p style={{ margin: 0, color: "#4b5563", fontSize: 14, lineHeight: 1.5 }}>
            קליטה דרך{" "}
            <code style={{ background: "#f3f4f6", padding: "2px 6px", borderRadius: 6 }}>/api/ingest/moving-order</code>
            או{" "}
            <code style={{ background: "#f3f4f6", padding: "2px 6px", borderRadius: 6 }}>/api/ingest/order</code>
            {" "}— מפתח API + כותרת{" "}
            <code style={{ background: "#f3f4f6", padding: "2px 6px", borderRadius: 6 }}>x-crm-tenant</code>.
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            onClick={() => void seedOrderFields()}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #c4b5fd",
              background: "#f5f3ff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            שדות הזמנה (קליטת הזמנות)
          </button>
          <button
            type="button"
            onClick={() => void seedMoverFields()}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            שדות מובילים (לקוחות משלמים)
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18, marginBottom: 16 }}>
        {tabBtn("match", "התאמת הזמנה")}
        {tabBtn("board", "הזמנות")}
        {tabBtn("pipelines", "פייפליינים")}
      </div>

      {err ? (
        <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b" }}>{err}</div>
      ) : null}
      {seedMsg ? <div style={{ marginTop: 8, fontSize: 14, color: "#374151" }}>{seedMsg}</div> : null}
      {orderSeedMsg ? <div style={{ marginTop: 8, fontSize: 14, color: "#374151" }}>{orderSeedMsg}</div> : null}

      {tab === "pipelines" ? <OrdersPipelinesTab /> : null}
      {tab === "board" ? <OrdersBoardTab /> : null}

      {tab === "match" ? (
        loading ? (
          <div style={{ padding: 24 }}>טוען…</div>
        ) : (
          <div style={{ display: "grid", gap: 16, marginTop: 22 }}>
            {sorted.length === 0 ? (
              <div style={{ padding: 20, background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb" }}>
                אין הזמנות עדיין.
              </div>
            ) : null}
            {sorted.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                drivers={drivers}
                dispatching={dispatching === order.id}
                isChecked={(id) => isChecked(order, id)}
                onToggleCheck={(id, c) => void setExcluded(order, id, c)}
                onDispatch={() => void dispatch(order)}
                onCancel={() => {
                  if (window.confirm("לבטל את ההזמנה?")) void patchStatus(order, "cancelled");
                }}
                onComplete={() => {
                  if (window.confirm("לסמן את ההזמנה כבוצעה?")) void patchStatus(order, "completed");
                }}
                onAddManual={(cid) => void addManualDriver(order, cid)}
                statusLabel={statusLabel}
              />
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

function OrderCard({
  order,
  drivers,
  dispatching,
  isChecked,
  onToggleCheck,
  onDispatch,
  onCancel,
  onComplete,
  onAddManual,
  statusLabel,
}: {
  order: MovingOrderRecord;
  drivers: Record<string, DriverSummary>;
  dispatching: boolean;
  isChecked: (id: string) => boolean;
  onToggleCheck: (id: string, checked: boolean) => void;
  onDispatch: () => void;
  onCancel: () => void;
  onComplete: () => void;
  onAddManual: (contact: { id: string; name: string; phone: string; email: string }) => void;
  statusLabel: (s: MovingOrderStatus) => string;
}) {
  const [pickerQ, setPickerQ] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerRows, setPickerRows] = useState<Array<{ id: string; name: string; phone: string; email: string }>>([]);

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

  function rowLabel(id: string): string {
    const d = drivers[id];
    const name = d?.name?.trim() || id;
    const phone = d?.phone?.trim();
    return phone ? `${name} · ${phone}` : name;
  }

  const canDispatch = order.status !== "cancelled" && order.status !== "completed";

  return (
    <article
      style={{
        padding: 18,
        borderRadius: 16,
        border: "1px solid #e5e7eb",
        background: "#fff",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>{cardTitle(order)}</div>
      <div style={{ fontSize: 14, color: "#374151", marginBottom: 4 }}>
        <strong>תאריך:</strong> {p.date ?? "—"}
      </div>
      <div style={{ fontSize: 14, color: "#374151", marginBottom: 4 }}>
        <strong>שלב בפייפליין:</strong> {order.stage ?? "—"}
      </div>
      <div style={{ fontSize: 14, color: "#374151", marginBottom: 4 }}>
        <strong>סטטוס:</strong> {statusLabel(order.status)}
        {order.dispatchedAt ? (
          <span style={{ color: "#6b7280", fontWeight: 400 }}> · נשלח webhook ב־{order.dispatchedAt.slice(0, 16).replace("T", " ")}</span>
        ) : null}
      </div>
      <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12, lineHeight: 1.5 }}>
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
      </div>

      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>מובילים מתאימים (תשתית — הסינון יורחב)</div>
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", display: "grid", gap: 6 }}>
        {order.matchedDriverIds.map((id) => {
          const driverPhone = drivers[id]?.phone?.trim();
          return (
            <li key={id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={isChecked(id)}
                disabled={!canDispatch}
                onChange={(e) => onToggleCheck(id, e.target.checked)}
              />
              <span style={{ flex: 1 }}>{rowLabel(id)}</span>
              {driverPhone ? <WhatsAppIconLink phone={driverPhone} size={18} /> : null}
            </li>
          );
        })}
        {order.matchedDriverIds.length === 0 ? (
          <li style={{ color: "#6b7280" }}>אין מוביל שעומד בכל התנאים (בדוק שדות מוביל ופייפליין).</li>
        ) : null}
      </ul>

      {order.optionalDriverIds.length > 0 ? (
        <>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: "#92400e" }}>אופציונלי (אזור מתאים בלבד)</div>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", display: "grid", gap: 6 }}>
            {order.optionalDriverIds.map((id) => {
              const driverPhone = drivers[id]?.phone?.trim();
              return (
                <li key={id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={isChecked(id)}
                    disabled={!canDispatch}
                    onChange={(e) => onToggleCheck(id, e.target.checked)}
                  />
                  <span style={{ flex: 1 }}>{rowLabel(id)}</span>
                  {driverPhone ? <WhatsAppIconLink phone={driverPhone} size={18} /> : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {order.manualDriverIds.length > 0 ? (
        <>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>נוספו ידנית</div>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", display: "grid", gap: 6 }}>
            {order.manualDriverIds.map((id) => {
              const driverPhone = drivers[id]?.phone?.trim();
              return (
                <li key={id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={isChecked(id)}
                    disabled={!canDispatch}
                    onChange={(e) => onToggleCheck(id, e.target.checked)}
                  />
                  <span style={{ flex: 1 }}>{rowLabel(id)}</span>
                  {driverPhone ? <WhatsAppIconLink phone={driverPhone} size={18} /> : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

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
          + הוסף מוביל מרשימת לקוחות משלמים
        </button>
        {pickerOpen ? (
          <div style={{ marginTop: 10, padding: 12, borderRadius: 10, border: "1px solid #e5e7eb", background: "#fafafa" }}>
            <input
              value={pickerQ}
              onChange={(e) => setPickerQ(e.target.value)}
              placeholder="חיפוש לפי שם / טלפון…"
              style={{ width: "100%", maxWidth: 360, padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db" }}
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

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
        <button
          type="button"
          disabled={!canDispatch || dispatching}
          onClick={onDispatch}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            border: "none",
            background: canDispatch ? "#059669" : "#9ca3af",
            color: "#fff",
            fontWeight: 700,
            cursor: canDispatch && !dispatching ? "pointer" : "not-allowed",
          }}
        >
          {dispatching ? "שולח…" : "שלח הזמנה למובילים (Webhook)"}
        </button>
        <button
          type="button"
          disabled={order.status === "cancelled" || order.status === "completed"}
          onClick={onComplete}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            border: "1px solid #d1d5db",
            background: "#fff",
            fontWeight: 600,
            cursor: order.status === "cancelled" || order.status === "completed" ? "not-allowed" : "pointer",
          }}
        >
          שלח לביצוע
        </button>
        <button
          type="button"
          disabled={order.status === "cancelled"}
          onClick={onCancel}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            border: "1px solid #fecaca",
            background: "#fff1f2",
            color: "#9f1239",
            fontWeight: 600,
            cursor: order.status === "cancelled" ? "not-allowed" : "pointer",
          }}
        >
          בטל הזמנה
        </button>
      </div>
    </article>
  );
}

function cardTitle(order: MovingOrderRecord): string {
  const cv = order.customValues ?? {};
  const fromCv = cv.moving_order_name ?? cv.moving_order_items_text;
  if (typeof fromCv === "string" && fromCv.trim()) return fromCv.trim().slice(0, 80);
  const p = order.payload;
  const parts = [p.items_text?.trim(), p.move_type?.trim(), p.name?.trim()].filter(Boolean);
  if (parts.length) return parts[0] as string;
  return p.order_id || order.id;
}

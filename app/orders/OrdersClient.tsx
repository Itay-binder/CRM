"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import OrdersBoardTab from "@/app/orders/OrdersBoardTab";
import { MatchOrderCard } from "@/app/orders/MatchOrderCard";
import OrdersPipelinesTab from "@/app/orders/OrdersPipelinesTab";
import type {
  DriverSummary,
  MoverMatchEnrichment,
  MovingOrderRecord,
  MovingOrderStatus,
  OrderMatchUiHints,
} from "@/lib/movingOrders/types";

type TabId = "orders" | "pipelines" | "match";

const ORDERS_TAB_STORAGE_KEY = "liftygo_crm_orders_tab";

function isTabId(v: string): v is TabId {
  return v === "orders" || v === "pipelines" || v === "match";
}
type ApiListOk = {
  ok: true;
  orders: MovingOrderRecord[];
  drivers: Record<string, DriverSummary>;
  moverEnrichment?: Record<string, MoverMatchEnrichment>;
  orderMatchUi?: Record<string, OrderMatchUiHints>;
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
    case "rejected":
      return "לא אושרה";
    default:
      return s;
  }
}

export default function OrdersClient() {
  const [tab, setTab] = useState<TabId>("orders");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [orders, setOrders] = useState<MovingOrderRecord[]>([]);
  const [drivers, setDrivers] = useState<Record<string, DriverSummary>>({});
  const [moverEnrichment, setMoverEnrichment] = useState<Record<string, MoverMatchEnrichment>>({});
  const [orderMatchUi, setOrderMatchUi] = useState<Record<string, OrderMatchUiHints>>({});
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [sentSuccessOrderId, setSentSuccessOrderId] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [notifyCustomerByOrderId, setNotifyCustomerByOrderId] = useState<Record<string, boolean>>({});
  const autoRematchedOnceRef = useRef(false);

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
      setMoverEnrichment(j.moverEnrichment ?? {});
      setOrderMatchUi(j.orderMatchUi ?? {});
      const needAutoRematch =
        !autoRematchedOnceRef.current &&
        j.orders.some((o) => !o.driverMatchFlags || Object.keys(o.driverMatchFlags).length === 0);
      if (needAutoRematch) {
        autoRematchedOnceRef.current = true;
        await Promise.all(
          j.orders
            .filter((o) => !o.driverMatchFlags || Object.keys(o.driverMatchFlags).length === 0)
            .map((o) =>
              fetch(`/api/moving-orders/${encodeURIComponent(o.id)}`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rematch: true }),
              }).catch(() => null)
            )
        );
        const r2 = await fetch("/api/moving-orders", { credentials: "include", cache: "no-store" });
        const j2 = (await r2.json()) as ApiListResponse;
        if (r2.ok && j2.ok) {
          setOrders(j2.orders);
          setDrivers(j2.drivers);
          setMoverEnrichment(j2.moverEnrichment ?? {});
          setOrderMatchUi(j2.orderMatchUi ?? {});
        }
      }
    } catch {
      setErr("שגיאה בטעינה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useLayoutEffect(() => {
    try {
      const raw = sessionStorage.getItem(ORDERS_TAB_STORAGE_KEY);
      if (raw && isTabId(raw)) setTab(raw);
    } catch {
      /* private mode / no storage */
    }
  }, []);

  const setTabPersist = useCallback((next: TabId) => {
    setTab(next);
    try {
      sessionStorage.setItem(ORDERS_TAB_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

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

  async function sendMatch(order: MovingOrderRecord) {
    const all = [
      ...new Set([...order.matchedDriverIds, ...order.optionalDriverIds, ...order.manualDriverIds]),
    ];
    const driverIds = all.filter((id) => {
      if (order.excludedDriverIds.includes(id)) return false;
      const issues = order.driverMatchIssues?.[id] ?? [];
      if (issues.some((x) => x.includes("זמינות"))) return false;
      return true;
    });
    setDispatching(order.id);
    try {
      const notifyCustomer = Boolean(notifyCustomerByOrderId[order.id]);
      const res = await fetch(`/api/moving-orders/${encodeURIComponent(order.id)}/match-send`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverIds, notifyCustomer }),
      });
      const j = (await res.json()) as { ok?: boolean; order?: MovingOrderRecord; error?: string };
      if (!res.ok || !j.ok) {
        alert(j.error ?? "שליחה נכשלה");
        return;
      }
      if (j.order) {
        setOrders((prev) => prev.map((o) => (o.id === order.id ? j.order! : o)));
      }
      setSentSuccessOrderId(order.id);
      setTimeout(() => setSentSuccessOrderId((cur) => (cur === order.id ? null : cur)), 6000);
      void load();
    } catch {
      alert("שגיאת רשת");
    } finally {
      setDispatching(null);
    }
  }

  async function deleteOrder(order: MovingOrderRecord) {
    const cv = order.customValues ?? {};
    const title =
      (typeof cv.moving_order_name === "string" && cv.moving_order_name.trim()
        ? cv.moving_order_name.trim()
        : null) ||
      order.payload.name?.trim() ||
      order.orderId ||
      order.id;
    if (!window.confirm(`למחוק לצמיתות את ההזמנה «${title}»? הפעולה אינה הפיכה.`)) return;
    setDeletingOrderId(order.id);
    try {
      const res = await fetch(`/api/moving-orders/${encodeURIComponent(order.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        alert(j.error ?? "מחיקה נכשלה");
        return;
      }
      void load();
    } catch {
      alert("שגיאת רשת");
    } finally {
      setDeletingOrderId(null);
    }
  }

  async function cancelMatch(order: MovingOrderRecord, reason: string) {
    try {
      const res = await fetch(`/api/moving-orders/${encodeURIComponent(order.id)}/match-cancel`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const j = (await res.json()) as { ok?: boolean; order?: MovingOrderRecord; error?: string };
      if (!res.ok || !j.ok) {
        alert(j.error ?? "ביטול נכשל");
        return;
      }
      if (j.order) {
        setOrders((prev) => prev.map((o) => (o.id === order.id ? j.order! : o)));
      }
    } catch {
      alert("שגיאת רשת");
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

  function isChecked(order: MovingOrderRecord, leadId: string): boolean {
    return !order.excludedDriverIds.includes(leadId);
  }

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>ניהול הזמנות</h1>
        <div style={{ display: "inline-flex", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 4 }}>
          <button
            type="button"
            onClick={() => setTabPersist("orders")}
            style={{
              padding: "8px 12px",
              border: "none",
              borderRadius: 8,
              background: tab === "orders" ? "#e9d5ff" : "transparent",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            הזמנות
          </button>
          <button
            type="button"
            onClick={() => setTabPersist("pipelines")}
            style={{
              padding: "8px 12px",
              border: "none",
              borderRadius: 8,
              background: tab === "pipelines" ? "#e9d5ff" : "transparent",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            פייפליינים
          </button>
          <button
            type="button"
            onClick={() => setTabPersist("match")}
            style={{
              padding: "8px 12px",
              border: "none",
              borderRadius: 8,
              background: tab === "match" ? "#e9d5ff" : "transparent",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            התאמת הזמנות
          </button>
        </div>
      </div>
      <p style={{ margin: "0 0 16px", color: "#4b5563", fontSize: 14, lineHeight: 1.5 }}>
        קליטה חיצונית דרך{" "}
        <code style={{ background: "#f3f4f6", padding: "2px 6px", borderRadius: 6 }}>/api/ingest/moving-order</code>
        {" או "}
        <code style={{ background: "#f3f4f6", padding: "2px 6px", borderRadius: 6 }}>/api/ingest/order</code>
        {" — מפתח API וכותרת "}
        <code style={{ background: "#f3f4f6", padding: "2px 6px", borderRadius: 6 }}>x-crm-tenant</code>.
      </p>

      {err ? (
        <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b" }}>{err}</div>
      ) : null}

      {tab === "pipelines" ? <OrdersPipelinesTab /> : null}
      {tab === "orders" ? <OrdersBoardTab /> : null}

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
              <MatchOrderCard
                key={order.id}
                order={order}
                matchUi={orderMatchUi[order.id] ?? null}
                drivers={drivers}
                enrichment={moverEnrichment}
                dispatching={dispatching === order.id}
                deleting={deletingOrderId === order.id}
                isChecked={(id) => isChecked(order, id)}
                onToggleCheck={(id, c) => void setExcluded(order, id, c)}
                onSendMatch={() => void sendMatch(order)}
                onCancelMatch={(reason) => void cancelMatch(order, reason)}
                onDelete={() => void deleteOrder(order)}
                statusLabel={statusLabel}
                sentNow={sentSuccessOrderId === order.id}
                notifyCustomer={Boolean(notifyCustomerByOrderId[order.id])}
                onNotifyCustomerChange={(checked) =>
                  setNotifyCustomerByOrderId((prev) => ({ ...prev, [order.id]: checked }))
                }
              />
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

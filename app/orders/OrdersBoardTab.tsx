"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MOVING_ORDERS_INTAKE_PIPELINE_ID } from "@/lib/movingOrders/pipelineConstants";
import type { MovingOrderRecord } from "@/lib/movingOrders/types";

type Pipeline = { id: string; name: string; stages: string[] };
type CF = { fieldId: string; label: string };
type ViewMode = "board" | "list";

function orderTitle(o: MovingOrderRecord): string {
  const cv = o.customValues ?? {};
  const n = cv.moving_order_name ?? cv.moving_order_order_id;
  if (typeof n === "string" && n.trim()) return n.trim();
  return o.payload.name?.trim() || o.payload.order_id || o.id;
}

export default function OrdersBoardTab() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState(MOVING_ORDERS_INTAKE_PIPELINE_ID);
  const [orders, setOrders] = useState<MovingOrderRecord[]>([]);
  const [fields, setFields] = useState<CF[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const selectedPipeline = useMemo(
    () => pipelines.find((p) => p.id === selectedPipelineId) ?? null,
    [pipelines, selectedPipelineId]
  );

  const loadPipelines = useCallback(async () => {
    const res = await fetch("/api/opportunities/pipelines?scope=moving_order", {
      credentials: "include",
      cache: "no-store",
    });
    const j = (await res.json()) as { ok?: boolean; pipelines?: Pipeline[] };
    if (res.ok && j.ok && j.pipelines?.length) {
      setPipelines(j.pipelines);
      setSelectedPipelineId((prev) =>
        j.pipelines!.some((p) => p.id === prev) ? prev : j.pipelines![0]!.id
      );
    }
  }, []);

  const loadOrders = useCallback(async () => {
    const u = new URL("/api/moving-orders", window.location.origin);
    if (selectedPipelineId) u.searchParams.set("pipelineId", selectedPipelineId);
    const res = await fetch(u.toString(), { credentials: "include", cache: "no-store" });
    const j = (await res.json()) as { ok?: boolean; orders?: MovingOrderRecord[]; error?: string };
    if (!res.ok || !j.ok) throw new Error(j.error ?? "טעינת הזמנות נכשלה");
    setOrders(j.orders ?? []);
  }, [selectedPipelineId]);

  const loadFields = useCallback(async () => {
    const u = new URL("/api/custom-fields", window.location.origin);
    u.searchParams.set("entityType", "moving_order");
    u.searchParams.set("pipelineId", selectedPipelineId);
    const res = await fetch(u.toString(), { credentials: "include", cache: "no-store" });
    const j = (await res.json()) as { ok?: boolean; fields?: Array<{ fieldId: string; label: string }> };
    if (res.ok && j.ok) {
      setFields((j.fields ?? []).map((f) => ({ fieldId: f.fieldId, label: f.label })).slice(0, 8));
    }
  }, [selectedPipelineId]);

  useEffect(() => {
    void loadPipelines();
  }, [loadPipelines]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        await loadOrders();
        await loadFields();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "שגיאה");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadOrders, loadFields]);

  async function patchStage(order: MovingOrderRecord, stage: string) {
    try {
      const res = await fetch(`/api/moving-orders/${encodeURIComponent(order.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      const j = (await res.json()) as { ok?: boolean; order?: MovingOrderRecord };
      if (res.ok && j.ok && j.order) {
        setOrders((prev) => prev.map((o) => (o.id === order.id ? j.order! : o)));
      }
    } catch {
      void loadOrders();
    }
  }

  const byStage = useMemo(() => {
    const stages = selectedPipeline?.stages ?? [];
    const m = new Map<string, MovingOrderRecord[]>();
    for (const s of stages) m.set(s, []);
    for (const o of orders) {
      const st = o.stage || stages[0] || "";
      if (!m.has(st)) m.set(st, []);
      m.get(st)!.push(o);
    }
    return m;
  }, [orders, selectedPipeline?.stages]);

  if (loading && orders.length === 0) {
    return <div style={{ padding: 16 }}>טוען תצוגת פייפליין…</div>;
  }

  return (
    <div style={{ maxWidth: 1400 }}>
      {err ? (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b" }}>
          {err}
        </div>
      ) : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <label style={{ fontWeight: 700 }}>פייפליין</label>
        <select
          value={selectedPipelineId}
          onChange={(e) => setSelectedPipelineId(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #d1d5db", minWidth: 220 }}
        >
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
          <button
            type="button"
            onClick={() => setViewMode("board")}
            style={{
              border: "none",
              background: viewMode === "board" ? "#e0f2fe" : "#fff",
              padding: "8px 14px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            לוח
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            style={{
              border: "none",
              background: viewMode === "list" ? "#e0f2fe" : "#fff",
              padding: "8px 14px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            רשימה
          </button>
        </div>
        <button
          type="button"
          onClick={() => void loadOrders()}
          style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #c4b5fd", background: "#f5f3ff", fontWeight: 700 }}
        >
          רענן
        </button>
      </div>

      {viewMode === "board" ? (
        <div
          style={{
            display: "flex",
            gap: 12,
            overflowX: "auto",
            paddingBottom: 8,
            direction: "rtl",
          }}
        >
          {(selectedPipeline?.stages ?? []).map((stage) => (
            <div
              key={stage}
              style={{
                flex: "0 0 260px",
                background: "#f9fafb",
                borderRadius: 14,
                border: "1px solid #e5e7eb",
                padding: 10,
                minHeight: 320,
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 10, fontSize: 14 }}>{stage}</div>
              <div style={{ display: "grid", gap: 10 }}>
                {(byStage.get(stage) ?? []).map((o) => (
                  <div
                    key={o.id}
                    style={{
                      background: "#fff",
                      borderRadius: 12,
                      padding: 12,
                      border: "1px solid #e5e7eb",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>{orderTitle(o)}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
                      {o.payload.phone || (o.customValues?.moving_order_phone as string) || "—"}
                    </div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4 }}>שלב</label>
                    <select
                      value={o.stage}
                      onChange={(e) => void patchStage(o, e.target.value)}
                      style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #d1d5db", fontSize: 12 }}
                    >
                      {(selectedPipeline?.stages ?? []).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                <th style={{ padding: 10, textAlign: "right", fontSize: 12 }}>כותרת</th>
                <th style={{ padding: 10, textAlign: "right", fontSize: 12 }}>טלפון</th>
                {fields.map((f) => (
                  <th key={f.fieldId} style={{ padding: 10, textAlign: "right", fontSize: 12 }}>
                    {f.label}
                  </th>
                ))}
                <th style={{ padding: 10, textAlign: "right", fontSize: 12 }}>שלב</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td style={{ padding: 10, borderTop: "1px solid #f3f4f6", fontWeight: 700 }}>{orderTitle(o)}</td>
                  <td style={{ padding: 10, borderTop: "1px solid #f3f4f6", fontSize: 13 }}>
                    {String(o.payload.phone ?? o.customValues?.moving_order_phone ?? "—")}
                  </td>
                  {fields.map((f) => (
                    <td key={f.fieldId} style={{ padding: 10, borderTop: "1px solid #f3f4f6", fontSize: 13 }}>
                      {String(o.customValues?.[f.fieldId] ?? "—")}
                    </td>
                  ))}
                  <td style={{ padding: 10, borderTop: "1px solid #f3f4f6" }}>
                    <select
                      value={o.stage}
                      onChange={(e) => void patchStage(o, e.target.value)}
                      style={{ padding: 6, borderRadius: 8, border: "1px solid #d1d5db", fontSize: 12 }}
                    >
                      {(selectedPipeline?.stages ?? []).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

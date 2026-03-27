"use client";

import { useEffect, useMemo, useState } from "react";

type Pipeline = {
  id: string;
  name: string;
  stages: string[];
  updatedAt?: string | null;
};

type Opportunity = {
  id: string;
  name: string;
  contactId: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  pipelineId: string;
  stage: string;
  assignedRep?: string;
  customValues?: Record<string, unknown>;
  createdAt: string | null;
};

type ContactRow = Record<string, string>;
type TabId = "opportunities" | "pipelines";
type ViewMode = "board" | "list";
type NoteItem = { id: string; text: string; createdAt: string };
type TaskItem = {
  id: string;
  title: string;
  dueAt: string;
  done: boolean;
  status?: "todo" | "in_progress" | "done";
  comments?: Array<{ id: string; text: string; createdAt: string }>;
  createdAt: string;
};

const BASE_OPP_COLS = [
  "name",
  "contactName",
  "pipelineName",
  "stage",
  "assignedRep",
  "contactPhone",
  "contactEmail",
  "createdAt",
];

export default function PipelineClient() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("opportunities");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState("");

  const [createPipelineOpen, setCreatePipelineOpen] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");
  const [newPipelineStages, setNewPipelineStages] = useState([
    "New Lead",
    "Contacted",
    "Proposal Sent",
    "Closed",
  ]);

  const [createOpportunityOpen, setCreateOpportunityOpen] = useState(false);
  const [newOppName, setNewOppName] = useState("");
  const [newOppContactId, setNewOppContactId] = useState("");
  const [newOppStage, setNewOppStage] = useState("");
  const [newOppAssignedRep, setNewOppAssignedRep] = useState("");
  const [oppVisibleCols, setOppVisibleCols] = useState<string[]>([]);
  const [oppColumnOrder, setOppColumnOrder] = useState<string[]>([]);
  const [manageOppColsOpen, setManageOppColsOpen] = useState(false);
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [oppDetailTab, setOppDetailTab] = useState<"details" | "notes" | "tasks">(
    "details"
  );
  const [oppNotes, setOppNotes] = useState<NoteItem[]>([]);
  const [oppTasks, setOppTasks] = useState<TaskItem[]>([]);
  const [oppCustomFieldIds, setOppCustomFieldIds] = useState<string[]>([]);
  const [pipelineMenuOpenId, setPipelineMenuOpenId] = useState<string | null>(null);
  const [editPipelineOpen, setEditPipelineOpen] = useState(false);
  const [editPipelineId, setEditPipelineId] = useState<string | null>(null);
  const [editPipelineName, setEditPipelineName] = useState("");
  const [editStages, setEditStages] = useState<string[]>([]);

  const selectedPipeline = useMemo(
    () => pipelines.find((p) => p.id === selectedPipelineId) ?? null,
    [pipelines, selectedPipelineId]
  );

  const oppForSelectedPipeline = useMemo(() => {
    if (!selectedPipelineId) return opportunities;
    return opportunities.filter((o) => o.pipelineId === selectedPipelineId);
  }, [opportunities, selectedPipelineId]);

  const grouped = useMemo(() => {
    const map: Record<string, Opportunity[]> = {};
    for (const s of selectedPipeline?.stages ?? []) map[s] = [];
    for (const o of oppForSelectedPipeline) {
      const key = o.stage || "—";
      map[key] ||= [];
      map[key].push(o);
    }
    return map;
  }, [oppForSelectedPipeline, selectedPipeline]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [pRes, oRes, cRes, cfRes] = await Promise.all([
        fetch("/api/opportunities/pipelines", { credentials: "include", cache: "no-store" }),
        fetch(
          selectedPipelineId
            ? `/api/opportunities?pipelineId=${encodeURIComponent(selectedPipelineId)}`
            : "/api/opportunities",
          { credentials: "include", cache: "no-store" }
        ),
        fetch("/api/contacts", { credentials: "include", cache: "no-store" }),
        fetch("/api/custom-fields?entityType=opportunity", {
          credentials: "include",
          cache: "no-store",
        }),
      ]);

      for (const r of [pRes, oRes, cRes, cfRes]) {
        if (r.status === 401) {
          window.location.href = `/login?returnTo=${encodeURIComponent("/pipeline")}`;
          return;
        }
        if (r.status === 403) {
          window.location.href = `/pending?returnTo=${encodeURIComponent("/pipeline")}`;
          return;
        }
      }

      const pJson = (await pRes.json().catch(() => ({}))) as {
        ok?: boolean;
        pipelines?: Pipeline[];
        error?: string;
      };
      const oJson = (await oRes.json().catch(() => ({}))) as {
        ok?: boolean;
        opportunities?: Opportunity[];
        error?: string;
      };
      const cJson = (await cRes.json().catch(() => ({}))) as {
        ok?: boolean;
        rows?: ContactRow[];
        error?: string;
      };
      const cfJson = (await cfRes.json().catch(() => ({}))) as {
        ok?: boolean;
        fields?: Array<{ fieldId: string }>;
      };

      if (!pJson.ok) throw new Error(pJson.error ?? "שגיאה בטעינת pipelines");
      if (!oJson.ok) throw new Error(oJson.error ?? "שגיאה בטעינת opportunities");
      if (!cJson.ok) throw new Error(cJson.error ?? "שגיאה בטעינת contacts");

      const p = pJson.pipelines ?? [];
      setPipelines(p);
      const opp = oJson.opportunities ?? [];
      setOpportunities(opp);
      setContacts(cJson.rows ?? []);
      setSelectedPipelineId((prev) => prev || p[0]?.id || "");
      const customFromSettings =
        cfJson.ok && Array.isArray(cfJson.fields)
          ? cfJson.fields.map((f) => f.fieldId)
          : [];
      setOppCustomFieldIds(
        Array.from(
          new Set(
            [
              ...customFromSettings,
              ...opp.flatMap((o) =>
                Object.keys((o.customValues ?? {}) as Record<string, unknown>)
              ),
            ]
          )
        ).sort()
      );
      setOppColumnOrder((prev) =>
        prev.length ? prev : [...BASE_OPP_COLS, ...Array.from(new Set(opp.flatMap((o) => Object.keys((o.customValues ?? {}) as Record<string, unknown>)))).sort()]
      );
      setOppVisibleCols((prev) =>
        prev.length ? prev : ["name", "contactName", "stage", "assignedRep", "contactPhone", "createdAt"]
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "לא ניתן לטעון ניהול הזדמנויות");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPipelineId]);

  async function createPipeline() {
    try {
      const res = await fetch("/api/opportunities/pipelines", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newPipelineName, stages: newPipelineStages }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        pipeline?: Pipeline;
      };
      if (!res.ok || !j.ok || !j.pipeline) throw new Error(j.error ?? "יצירת פייפליין נכשלה");
      setCreatePipelineOpen(false);
      setSelectedPipelineId(j.pipeline.id);
      setNewPipelineName("");
      setNewPipelineStages(["New Lead", "Contacted", "Proposal Sent", "Closed"]);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "יצירת פייפליין נכשלה");
    }
  }

  async function createOpportunity() {
    try {
      const res = await fetch("/api/opportunities", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newOppName,
          contactId: newOppContactId,
          pipelineId: selectedPipelineId,
          stage: newOppStage || selectedPipeline?.stages?.[0] || "New Lead",
          assignedRep: newOppAssignedRep,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "יצירת הזדמנות נכשלה");
      setCreateOpportunityOpen(false);
      setNewOppName("");
      setNewOppContactId("");
      setNewOppStage("");
      setNewOppAssignedRep("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "יצירת הזדמנות נכשלה");
    }
  }

  async function openOpportunityDetail(id: string) {
    const res = await fetch(`/api/opportunities/${encodeURIComponent(id)}`, {
      credentials: "include",
      cache: "no-store",
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      opportunity?: Opportunity & { notes?: NoteItem[]; tasks?: TaskItem[] };
    };
    if (!res.ok || !j.ok || !j.opportunity) {
      setErr(j.error ?? "טעינת הזדמנות נכשלה");
      return;
    }
    setSelectedOpp(j.opportunity);
    setOppNotes(j.opportunity.notes ?? []);
    setOppTasks(j.opportunity.tasks ?? []);
    setOppDetailTab("details");
  }

  async function saveOpportunityPatch(
    id: string,
    patch: {
      name?: string;
      stage?: string;
      pipelineId?: string;
      assignedRep?: string;
      customValues?: Record<string, unknown>;
      notes?: NoteItem[];
      tasks?: TaskItem[];
    }
  ) {
    const res = await fetch(`/api/opportunities/${encodeURIComponent(id)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      opportunity?: Opportunity & { notes?: NoteItem[]; tasks?: TaskItem[] };
    };
    if (!res.ok || !j.ok || !j.opportunity) {
      setErr(j.error ?? "שמירת הזדמנות נכשלה");
      return;
    }
    setSelectedOpp(j.opportunity);
    setOppNotes(j.opportunity.notes ?? []);
    setOppTasks(j.opportunity.tasks ?? []);
    await load();
  }

  async function onDropOpportunity(oppId: string, stage: string) {
    const opp = opportunities.find((o) => o.id === oppId);
    if (!opp || opp.stage === stage) return;
    await saveOpportunityPatch(opp.id, { stage, pipelineId: selectedPipelineId });
  }

  const oppDisplayCols = useMemo(() => {
    const order = oppColumnOrder.length ? oppColumnOrder : BASE_OPP_COLS;
    const visible = oppVisibleCols.length ? oppVisibleCols : order;
    return order.filter((h) => visible.includes(h));
  }, [oppColumnOrder, oppVisibleCols]);

  function opportunityCell(o: Opportunity, col: string): string {
    if (col === "pipelineName") {
      return pipelines.find((p) => p.id === o.pipelineId)?.name || o.pipelineId;
    }
    if (col in o) return String((o as Record<string, unknown>)[col] ?? "");
    return String((o.customValues ?? {})[col] ?? "");
  }

  function openPipelineEdit(p: Pipeline) {
    setEditPipelineId(p.id);
    setEditPipelineName(p.name);
    setEditStages(p.stages.length ? [...p.stages] : [""]);
    setPipelineMenuOpenId(null);
    setEditPipelineOpen(true);
  }

  async function savePipelineEdit() {
    if (!editPipelineId) return;
    const res = await fetch(
      `/api/opportunities/pipelines/${encodeURIComponent(editPipelineId)}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editPipelineName,
          stages: editStages,
        }),
      }
    );
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    if (!res.ok || !j.ok) {
      setErr(j.error ?? "עדכון פייפליין נכשל");
      return;
    }
    setEditPipelineOpen(false);
    setEditPipelineId(null);
    await load();
  }

  async function duplicatePipelineById(id: string) {
    const res = await fetch(
      `/api/opportunities/pipelines/${encodeURIComponent(id)}`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "duplicate" }),
      }
    );
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      pipeline?: Pipeline;
    };
    if (!res.ok || !j.ok) {
      setErr(j.error ?? "שכפול פייפליין נכשל");
      return;
    }
    setPipelineMenuOpenId(null);
    await load();
  }

  async function deletePipelineById(id: string) {
    const ok = window.confirm("למחוק את הפייפליין הזה?");
    if (!ok) return;
    const res = await fetch(
      `/api/opportunities/pipelines/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        credentials: "include",
      }
    );
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    if (!res.ok || !j.ok) {
      setErr(j.error ?? "מחיקת פייפליין נכשלה");
      return;
    }
    setPipelineMenuOpenId(null);
    if (selectedPipelineId === id) {
      setSelectedPipelineId("");
    }
    await load();
  }

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>ניהול הזדמנויות</h1>
        <div style={{ display: "inline-flex", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 4 }}>
          <button type="button" onClick={() => setTab("opportunities")} style={{ padding: "8px 12px", border: "none", borderRadius: 8, background: tab === "opportunities" ? "#e9d5ff" : "transparent", fontWeight: 800, cursor: "pointer" }}>
            הזדמנויות
          </button>
          <button type="button" onClick={() => setTab("pipelines")} style={{ padding: "8px 12px", border: "none", borderRadius: 8, background: tab === "pipelines" ? "#e9d5ff" : "transparent", fontWeight: 800, cursor: "pointer" }}>
            פייפליינים
          </button>
        </div>
        <div style={{ flex: 1 }} />

        {tab === "opportunities" && (
          <>
            <span style={{ fontWeight: 800, color: "#0c4a6e", background: "#e0f2fe", borderRadius: 999, padding: "4px 10px", fontSize: 12 }}>
              {oppForSelectedPipeline.length} opportunities
            </span>
            <select value={selectedPipelineId} onChange={(e) => setSelectedPipelineId(e.target.value)} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", minWidth: 220 }}>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div style={{ display: "inline-flex", borderRadius: 10, border: "1px solid #e5e7eb", overflow: "hidden", background: "#fff" }}>
              <button type="button" onClick={() => setViewMode("board")} style={{ border: "none", background: viewMode === "board" ? "#e0f2fe" : "transparent", padding: "8px 10px", cursor: "pointer", fontWeight: 800 }}>
                ◫
              </button>
              <button type="button" onClick={() => setViewMode("list")} style={{ border: "none", background: viewMode === "list" ? "#e0f2fe" : "transparent", padding: "8px 10px", cursor: "pointer", fontWeight: 800 }}>
                ≣
              </button>
            </div>
            <button type="button" onClick={() => { setCreateOpportunityOpen(true); setNewOppContactId((contacts[0]?.id as string) || ""); setNewOppStage(selectedPipeline?.stages?.[0] || "New Lead"); }} style={{ padding: "10px 12px", borderRadius: 12, border: "none", background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)", color: "#fff", cursor: "pointer", fontWeight: 800 }}>
              + Add opportunity
            </button>
            <button
              type="button"
              onClick={() => setManageOppColsOpen(true)}
              style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontWeight: 800 }}
            >
              ניהול עמודות
            </button>
          </>
        )}

        {tab === "pipelines" && (
          <button type="button" onClick={() => setCreatePipelineOpen(true)} style={{ padding: "10px 12px", borderRadius: 12, border: "none", background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)", color: "#fff", cursor: "pointer", fontWeight: 800 }}>
            Create Pipeline +
          </button>
        )}
      </div>

      {err && <div style={{ marginTop: 14, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: 12, borderRadius: 12 }}>{err}</div>}
      {loading && <div style={{ color: "#6b7280", fontWeight: 700 }}>טוען...</div>}

      {tab === "opportunities" && (
        <>
          {viewMode === "list" ? (
            <div
              style={{
                marginTop: 14,
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 16,
                width: "100%",
                maxWidth: "100%",
                overflowX: "auto",
                overflowY: "hidden",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
                <thead>
                  <tr>
                    {oppDisplayCols.map((h) => (
                      <th key={h} style={{ textAlign: "right", padding: "10px 12px", borderBottom: "2px solid #e5e7eb", background: "#f8fafc", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {oppForSelectedPipeline.map((o) => (
                    <tr key={o.id}>
                      {oppDisplayCols.map((col, idx) => (
                        <td key={col} style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                          {idx === 0 ? (
                            <button type="button" onClick={() => void openOpportunityDetail(o.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#4c1d95", fontWeight: 800, padding: 0 }}>
                              {opportunityCell(o, col)}
                            </button>
                          ) : (
                            opportunityCell(o, col)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!loading && oppForSelectedPipeline.length === 0 && <tr><td colSpan={Math.max(oppDisplayCols.length, 1)} style={{ padding: 16, color: "#6b7280", fontWeight: 700 }}>אין הזדמנויות בפייפליין הנבחר.</td></tr>}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ marginTop: 16, overflowX: "auto", maxWidth: "100%", paddingBottom: 10 }}>
              <div style={{ display: "flex", gap: 12, minWidth: 900 }}>
                {(selectedPipeline?.stages ?? []).map((stage) => {
                  const list = grouped[stage] ?? [];
                  return (
                    <div key={stage} style={{ width: 320, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontWeight: 900 }}>{stage}</div>
                        <div style={{ background: "#f5f3ff", border: "1px solid #e9d5ff", padding: "4px 8px", borderRadius: 999, fontWeight: 900, color: "#6d28d9" }}>{list.length}</div>
                      </div>
                      <div style={{ marginTop: 10, display: "grid", gap: 8, minHeight: 90 }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          const oppId = e.dataTransfer.getData("text/opportunity-id");
                          if (oppId) void onDropOpportunity(oppId, stage);
                        }}
                      >
                        {list.length === 0 ? (
                          <div style={{ color: "#9ca3af", fontWeight: 700, fontSize: 12 }}>אין הזדמנויות כאן</div>
                        ) : (
                          list.map((o) => (
                            <div
                              key={o.id}
                              draggable
                              onDragStart={(e) => e.dataTransfer.setData("text/opportunity-id", o.id)}
                              style={{ border: "1px solid #f3f4f6", borderRadius: 12, padding: 10, background: "#fafafa", cursor: "grab" }}
                            >
                              <button type="button" onClick={() => void openOpportunityDetail(o.id)} style={{ border: "none", background: "transparent", padding: 0, textAlign: "right", cursor: "pointer", fontWeight: 900, fontSize: 12, wordBreak: "break-word", color: "#111827" }}>{o.name}</button>
                              <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>{o.contactName || o.contactEmail || o.contactPhone || o.contactId}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {tab === "pipelines" && (
        <div
          style={{
            marginTop: 14,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            width: "100%",
            maxWidth: "100%",
            overflowX: "auto",
            overflowY: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
            <thead>
              <tr>
                {["Actions", "Updated On", "No. of stages", "Pipeline name"].map((h) => (
                  <th key={h} style={{ textAlign: "right", padding: "10px 12px", borderBottom: "2px solid #e5e7eb", background: "#f8fafc", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pipelines.map((p) => (
                <tr key={p.id}>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", position: "relative" }}>
                    <button
                      type="button"
                      onClick={() => setPipelineMenuOpenId((x) => (x === p.id ? null : p.id))}
                      style={{ border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", padding: "4px 8px", cursor: "pointer" }}
                      title="פעולות"
                    >
                      ⋮
                    </button>
                    {pipelineMenuOpenId === p.id && (
                      <div
                        style={{
                          position: "absolute",
                          top: 34,
                          right: 12,
                          background: "#fff",
                          border: "1px solid #e5e7eb",
                          borderRadius: 10,
                          boxShadow: "0 12px 24px rgba(0,0,0,0.08)",
                          padding: 6,
                          zIndex: 20,
                          minWidth: 160,
                        }}
                      >
                        <button type="button" onClick={() => openPipelineEdit(p)} style={{ display: "block", width: "100%", textAlign: "right", border: "none", background: "transparent", padding: "8px 10px", cursor: "pointer" }}>
                          עריכת פייפליין
                        </button>
                        <button type="button" onClick={() => void duplicatePipelineById(p.id)} style={{ display: "block", width: "100%", textAlign: "right", border: "none", background: "transparent", padding: "8px 10px", cursor: "pointer" }}>
                          שכפול
                        </button>
                        <button type="button" onClick={() => void deletePipelineById(p.id)} style={{ display: "block", width: "100%", textAlign: "right", border: "none", background: "transparent", padding: "8px 10px", cursor: "pointer", color: "#b91c1c" }}>
                          מחיקה
                        </button>
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                    {p.updatedAt ? String(p.updatedAt).slice(0, 10) : "—"}
                  </td>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                    {p.stages.length}
                  </td>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                    <div style={{ fontWeight: 800 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{p.stages.join(" -> ")}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createPipelineOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.2)", display: "grid", placeItems: "center", zIndex: 80 }} onMouseDown={() => setCreatePipelineOpen(false)}>
          <div style={{ width: "min(760px, 94vw)", background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", padding: 16 }} onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, marginBottom: 10 }}>Create Pipeline</h3>
            <input value={newPipelineName} onChange={(e) => setNewPipelineName(e.target.value)} placeholder="Pipeline name" style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", marginBottom: 10 }} />
            <div style={{ display: "grid", gap: 8 }}>
              {newPipelineStages.map((s, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                  <input value={s} onChange={(e) => setNewPipelineStages((arr) => arr.map((x, idx) => (idx === i ? e.target.value : x)))} placeholder={`Stage ${i + 1}`} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }} />
                  <button type="button" onClick={() => setNewPipelineStages((arr) => arr.filter((_, idx) => idx !== i))} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>מחק</button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8 }}>
              <button type="button" onClick={() => setNewPipelineStages((arr) => [...arr, ""])} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>Add stage +</button>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button type="button" onClick={() => void createPipeline()} style={{ padding: "10px 12px", borderRadius: 12, border: "none", background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)", color: "#fff", cursor: "pointer", fontWeight: 800 }}>Create</button>
              <button type="button" onClick={() => setCreatePipelineOpen(false)} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {editPipelineOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 90 }}>
          <div
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.2)" }}
            onMouseDown={() => setEditPipelineOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: "min(520px, 94vw)",
              height: "100%",
              background: "#fff",
              borderLeft: "1px solid #e5e7eb",
              boxShadow: "-12px 0 30px rgba(0,0,0,0.08)",
              padding: 16,
              overflow: "auto",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, marginBottom: 10 }}>עריכת פייפליין</h3>
            <input
              value={editPipelineName}
              onChange={(e) => setEditPipelineName(e.target.value)}
              placeholder="שם פייפליין"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", marginBottom: 10 }}
            />
            <div style={{ display: "grid", gap: 8 }}>
              {editStages.map((s, i) => (
                <div key={`${i}-${s}`} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 8 }}>
                  <input
                    value={s}
                    onChange={(e) =>
                      setEditStages((arr) => arr.map((x, idx) => (idx === i ? e.target.value : x)))
                    }
                    placeholder={`Stage ${i + 1}`}
                    style={{ padding: "9px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setEditStages((arr) => {
                        if (i === 0) return arr;
                        const next = [...arr];
                        [next[i - 1], next[i]] = [next[i], next[i - 1]];
                        return next;
                      })
                    }
                    style={{ padding: "9px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
                    title="הזז למעלה"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setEditStages((arr) => {
                        if (i >= arr.length - 1) return arr;
                        const next = [...arr];
                        [next[i + 1], next[i]] = [next[i], next[i + 1]];
                        return next;
                      })
                    }
                    style={{ padding: "9px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
                    title="הזז למטה"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditStages((arr) => arr.filter((_, idx) => idx !== i))}
                    style={{ padding: "9px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", color: "#b91c1c" }}
                    title="מחק שלב"
                  >
                    מחק
                  </button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setEditStages((arr) => [...arr, ""])}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
              >
                Add Stage +
              </button>
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => void savePipelineEdit()}
                style={{ padding: "10px 12px", borderRadius: 12, border: "none", background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)", color: "#fff", cursor: "pointer", fontWeight: 800 }}
              >
                שמור שינויים
              </button>
              <button
                type="button"
                onClick={() => setEditPipelineOpen(false)}
                style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {createOpportunityOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.2)", display: "grid", placeItems: "center", zIndex: 80 }} onMouseDown={() => setCreateOpportunityOpen(false)}>
          <div style={{ width: "min(620px, 94vw)", background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", padding: 16 }} onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, marginBottom: 10 }}>Add opportunity</h3>
            <div style={{ display: "grid", gap: 8 }}>
              <input value={newOppName} onChange={(e) => setNewOppName(e.target.value)} placeholder="Opportunity name" style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }} />
              <select value={newOppContactId} onChange={(e) => setNewOppContactId(e.target.value)} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}>
                {contacts.map((c) => (
                  <option key={(c.id || c.email || c.phone) as string} value={c.id}>
                    {(c.name || c.email || c.phone || c.id) as string}
                  </option>
                ))}
              </select>
              <select value={newOppStage} onChange={(e) => setNewOppStage(e.target.value)} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}>
                {(selectedPipeline?.stages ?? []).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input value={newOppAssignedRep} onChange={(e) => setNewOppAssignedRep(e.target.value)} placeholder="נציג משויך" style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }} />
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button type="button" onClick={() => void createOpportunity()} style={{ padding: "10px 12px", borderRadius: 12, border: "none", background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)", color: "#fff", cursor: "pointer", fontWeight: 800 }}>Create</button>
              <button type="button" onClick={() => setCreateOpportunityOpen(false)} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {manageOppColsOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 90 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.2)" }} onMouseDown={() => setManageOppColsOpen(false)} />
          <div style={{ position: "absolute", top: 0, right: 0, height: "100%", width: "min(420px, 94vw)", overflow: "auto", background: "#fff", borderLeft: "1px solid #e5e7eb", padding: 16 }} onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, marginBottom: 10 }}>ניהול עמודות (הזדמנויות)</h3>
            {[...BASE_OPP_COLS, ...oppCustomFieldIds].map((h) => (
              <label key={h} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                <input type="checkbox" checked={oppVisibleCols.includes(h)} onChange={(e) => setOppVisibleCols((arr) => e.target.checked ? [...arr, h] : arr.filter((x) => x !== h))} />
                <span>{h}</span>
              </label>
            ))}
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setManageOppColsOpen(false)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>סגור</button>
            </div>
          </div>
        </div>
      )}

      {selectedOpp && (
        <div style={{ position: "fixed", inset: 0, zIndex: 96 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.2)" }} onMouseDown={() => setSelectedOpp(null)} />
          <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: "min(520px, 94vw)", overflow: "auto", background: "#fff", borderRight: "1px solid #e5e7eb", padding: 16 }} onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, marginBottom: 10 }}>{selectedOpp.name}</h3>
            <div style={{ display: "inline-flex", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
              {(["details", "notes", "tasks"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setOppDetailTab(t)} style={{ border: "none", background: oppDetailTab === t ? "#ede9fe" : "#fff", padding: "8px 10px", cursor: "pointer", fontWeight: 800 }}>
                  {t === "details" ? "פרטים" : t === "notes" ? "פתקים" : "משימות"}
                </button>
              ))}
            </div>
            {oppDetailTab === "details" && (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                <input value={selectedOpp.name} onChange={(e) => setSelectedOpp((x) => (x ? { ...x, name: e.target.value } : x))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                <select value={selectedOpp.stage} onChange={(e) => setSelectedOpp((x) => (x ? { ...x, stage: e.target.value } : x))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                  {(selectedPipeline?.stages ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <input value={selectedOpp.assignedRep ?? ""} onChange={(e) => setSelectedOpp((x) => (x ? { ...x, assignedRep: e.target.value } : x))} placeholder="נציג משויך" style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                {oppCustomFieldIds.map((fid) => (
                  <input key={fid} value={String((selectedOpp.customValues ?? {})[fid] ?? "")} onChange={(e) => setSelectedOpp((x) => (x ? { ...x, customValues: { ...(x.customValues ?? {}), [fid]: e.target.value } } : x))} placeholder={fid} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                ))}
                <button type="button" onClick={() => void saveOpportunityPatch(selectedOpp.id, { name: selectedOpp.name, stage: selectedOpp.stage, pipelineId: selectedOpp.pipelineId, assignedRep: selectedOpp.assignedRep ?? "", customValues: selectedOpp.customValues ?? {} })} style={{ padding: "9px 12px", borderRadius: 10, border: "none", background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)", color: "#fff", fontWeight: 800, cursor: "pointer" }}>שמור</button>
              </div>
            )}
            {oppDetailTab === "notes" && (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                {oppNotes.map((n) => <textarea key={n.id} value={n.text} readOnly style={{ minHeight: 70, padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />)}
                <button type="button" onClick={() => {
                  const text = window.prompt("טקסט לפתק");
                  if (!text?.trim()) return;
                  const notes = [...oppNotes, { id: crypto.randomUUID(), text: text.trim(), createdAt: new Date().toISOString() }];
                  setOppNotes(notes);
                  void saveOpportunityPatch(selectedOpp.id, { notes });
                }} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>+ הוסף פתק</button>
              </div>
            )}
            {oppDetailTab === "tasks" && (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                {oppTasks.map((t) => (
                  <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                    <input type="checkbox" checked={Boolean((t.status ?? (t.done ? "done" : "todo")) === "done")} onChange={(e) => {
                      const tasks = oppTasks.map((x) =>
                        x.id === t.id
                          ? {
                              ...x,
                              done: e.target.checked,
                              status: (e.target.checked ? "done" : "todo") as
                                | "done"
                                | "todo",
                            }
                          : x
                      );
                      setOppTasks(tasks);
                      void saveOpportunityPatch(selectedOpp.id, { tasks });
                    }} />
                    <span style={{ fontWeight: 700 }}>{t.title}</span>
                    <span style={{ color: "#6b7280", fontSize: 12 }}>{t.dueAt}</span>
                  </label>
                ))}
                <button type="button" onClick={() => {
                  const title = window.prompt("כותרת משימה");
                  if (!title?.trim()) return;
                  const dueAt = window.prompt("תאריך ושעה (YYYY-MM-DD HH:mm)", new Date().toISOString().slice(0, 16).replace("T", " ")) || "";
                  const tasks = [...oppTasks, { id: crypto.randomUUID(), title: title.trim(), dueAt: dueAt.trim(), done: false, status: "todo" as const, comments: [] as Array<{ id: string; text: string; createdAt: string }>, createdAt: new Date().toISOString() }];
                  setOppTasks(tasks);
                  void saveOpportunityPatch(selectedOpp.id, { tasks });
                }} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>+ הוסף משימה</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


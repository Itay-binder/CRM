"use client";

import { useEffect, useMemo, useState } from "react";

type Pipeline = {
  id: string;
  name: string;
  stages: string[];
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
  lastNoteBody?: string;
  createdAt: string | null;
};

type ContactRow = Record<string, string>;
type TabId = "opportunities" | "pipelines";
type ViewMode = "board" | "list";

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
  const [stageSavingId, setStageSavingId] = useState<string | null>(null);

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
      const [pRes, oRes, cRes] = await Promise.all([
        fetch("/api/opportunities/pipelines", { credentials: "include", cache: "no-store" }),
        fetch(
          selectedPipelineId
            ? `/api/opportunities?pipelineId=${encodeURIComponent(selectedPipelineId)}`
            : "/api/opportunities",
          { credentials: "include", cache: "no-store" }
        ),
        fetch("/api/contacts", { credentials: "include", cache: "no-store" }),
      ]);

      for (const r of [pRes, oRes, cRes]) {
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

      if (!pJson.ok) throw new Error(pJson.error ?? "שגיאה בטעינת pipelines");
      if (!oJson.ok) throw new Error(oJson.error ?? "שגיאה בטעינת opportunities");
      if (!cJson.ok) throw new Error(cJson.error ?? "שגיאה בטעינת contacts");

      const p = pJson.pipelines ?? [];
      setPipelines(p);
      setOpportunities(oJson.opportunities ?? []);
      setContacts(cJson.rows ?? []);
      setSelectedPipelineId((prev) => prev || p[0]?.id || "");
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

  async function patchOpportunityStage(opportunityId: string, stage: string) {
    setStageSavingId(opportunityId);
    setErr(null);
    try {
      const res = await fetch(`/api/opportunities/${encodeURIComponent(opportunityId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "עדכון שלב נכשל");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "עדכון שלב נכשל");
    } finally {
      setStageSavingId(null);
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
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "יצירת הזדמנות נכשלה");
      setCreateOpportunityOpen(false);
      setNewOppName("");
      setNewOppContactId("");
      setNewOppStage("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "יצירת הזדמנות נכשלה");
    }
  }

  return (
    <div>
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
            <div style={{ marginTop: 14, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
                <thead>
                  <tr>
                    {["Opportunity name", "Contact", "Pipeline", "Stage", "Last note", "Phone", "Email", "Created"].map((h) => (
                      <th key={h} style={{ textAlign: "right", padding: "10px 12px", borderBottom: "2px solid #e5e7eb", background: "#f8fafc", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {oppForSelectedPipeline.map((o) => {
                    const pipe = pipelines.find((p) => p.id === o.pipelineId);
                    const stageOptions = pipe?.stages?.length ? pipe.stages : [o.stage];
                    return (
                      <tr key={o.id}>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>{o.name}</td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>{o.contactName || o.contactId}</td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>{pipe?.name || o.pipelineId}</td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                          <select
                            value={o.stage}
                            disabled={stageSavingId === o.id}
                            onChange={(e) => void patchOpportunityStage(o.id, e.target.value)}
                            style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb", minWidth: 140 }}
                          >
                            {stageOptions.includes(o.stage) ? null : (
                              <option value={o.stage}>{o.stage}</option>
                            )}
                            {stageOptions.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", fontSize: 13, color: "#374151" }}>
                          {o.lastNoteBody || "—"}
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>{o.contactPhone || ""}</td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>{o.contactEmail || ""}</td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>{o.createdAt ? String(o.createdAt).slice(0, 10) : ""}</td>
                      </tr>
                    );
                  })}
                  {!loading && oppForSelectedPipeline.length === 0 && <tr><td colSpan={8} style={{ padding: 16, color: "#6b7280", fontWeight: 700 }}>אין הזדמנויות בפייפליין הנבחר.</td></tr>}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ marginTop: 16, overflowX: "auto", paddingBottom: 10 }}>
              <div style={{ display: "flex", gap: 12, minWidth: 900 }}>
                {(selectedPipeline?.stages ?? []).map((stage) => {
                  const list = grouped[stage] ?? [];
                  return (
                    <div key={stage} style={{ width: 320, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontWeight: 900 }}>{stage}</div>
                        <div style={{ background: "#f5f3ff", border: "1px solid #e9d5ff", padding: "4px 8px", borderRadius: 999, fontWeight: 900, color: "#6d28d9" }}>{list.length}</div>
                      </div>
                      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                        {list.length === 0 ? (
                          <div style={{ color: "#9ca3af", fontWeight: 700, fontSize: 12 }}>אין הזדמנויות כאן</div>
                        ) : (
                          list.map((o) => {
                            const pipe = pipelines.find((p) => p.id === o.pipelineId);
                            const stageOptions = pipe?.stages?.length ? pipe.stages : [o.stage];
                            return (
                              <div key={o.id} style={{ border: "1px solid #f3f4f6", borderRadius: 12, padding: 10, background: "#fafafa" }}>
                                <div style={{ fontWeight: 900, fontSize: 12, wordBreak: "break-word" }}>{o.name}</div>
                                <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>{o.contactName || o.contactEmail || o.contactPhone || o.contactId}</div>
                                {o.lastNoteBody ? (
                                  <div style={{ marginTop: 6, fontSize: 11, color: "#4b5563", fontWeight: 700 }}>פתק: {o.lastNoteBody}</div>
                                ) : null}
                                <select
                                  value={o.stage}
                                  disabled={stageSavingId === o.id}
                                  onChange={(e) => void patchOpportunityStage(o.id, e.target.value)}
                                  style={{ marginTop: 8, width: "100%", padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                                >
                                  {stageOptions.includes(o.stage) ? null : (
                                    <option value={o.stage}>{o.stage}</option>
                                  )}
                                  {stageOptions.map((s) => (
                                    <option key={s} value={s}>
                                      {s}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            );
                          })
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
        <div style={{ marginTop: 14, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr>
                {["Pipeline name", "No. of stages"].map((h) => (
                  <th key={h} style={{ textAlign: "right", padding: "10px 12px", borderBottom: "2px solid #e5e7eb", background: "#f8fafc", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pipelines.map((p) => (
                <tr key={p.id}>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                    <div style={{ fontWeight: 800 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{p.stages.join(" -> ")}</div>
                  </td>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>{p.stages.length}</td>
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
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button type="button" onClick={() => void createOpportunity()} style={{ padding: "10px 12px", borderRadius: 12, border: "none", background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)", color: "#fff", cursor: "pointer", fontWeight: 800 }}>Create</button>
              <button type="button" onClick={() => setCreateOpportunityOpen(false)} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


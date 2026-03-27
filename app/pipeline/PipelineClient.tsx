"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

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
  status?: "פתוח" | "זכיה" | "הפסד";
  assignedRep?: string;
  email?: string;
  phone?: string;
  utmSource?: string;
  utmCampaign?: string;
  utmMedium?: string;
  utmContent?: string;
  landingpage?: string;
  tags?: string[];
  lastLeadAt?: string | null;
  customValues?: Record<string, unknown>;
  createdAt: string | null;
  updatedAt?: string | null;
};

type ContactRow = Record<string, string>;
type TabId = "opportunities" | "pipelines";
type ViewMode = "board" | "list";
type NoteItem = { id: string; text: string; createdAt: string; createdBy?: string };
type TaskItem = {
  id: string;
  title: string;
  dueAt: string;
  done: boolean;
  status?: "todo" | "in_progress" | "done";
  comments?: Array<{ id: string; text: string; createdAt: string }>;
  createdAt: string;
};
type SortDir = "asc" | "desc";
type SortState = { col: string; dir: SortDir } | null;
type EditingCell = { id: string; col: string; value: string };

const BASE_OPP_COLS = [
  "name",
  "contactName",
  "email",
  "phone",
  "pipelineName",
  "stage",
  "status",
  "utmSource",
  "utmCampaign",
  "utmMedium",
  "utmContent",
  "landingpage",
  "tags",
  "assignedRep",
  "createdAt",
  "updatedAt",
  "lastLeadAt",
];

export default function PipelineClient() {
  const searchParams = useSearchParams();
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
  const [newOppStatus, setNewOppStatus] = useState<"פתוח" | "זכיה" | "הפסד">("פתוח");
  const [newOppAssignedRep, setNewOppAssignedRep] = useState("");
  const [oppVisibleCols, setOppVisibleCols] = useState<string[]>([]);
  const [oppColumnOrder, setOppColumnOrder] = useState<string[]>([]);
  const [manageOppColsOpen, setManageOppColsOpen] = useState(false);
  const [oppDragIndex, setOppDragIndex] = useState<number | null>(null);
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [oppDetailTab, setOppDetailTab] = useState<"details" | "notes" | "tasks">(
    "details"
  );
  const [oppNotes, setOppNotes] = useState<NoteItem[]>([]);
  const [oppTasks, setOppTasks] = useState<TaskItem[]>([]);
  const [newOppNoteText, setNewOppNoteText] = useState("");
  const [oppCustomFieldIds, setOppCustomFieldIds] = useState<string[]>([]);
  const [pipelineMenuOpenId, setPipelineMenuOpenId] = useState<string | null>(null);
  const [editPipelineOpen, setEditPipelineOpen] = useState(false);
  const [editPipelineId, setEditPipelineId] = useState<string | null>(null);
  const [editPipelineName, setEditPipelineName] = useState("");
  const [editStages, setEditStages] = useState<string[]>([]);
  const [editDragIndex, setEditDragIndex] = useState<number | null>(null);
  const [adminUsers, setAdminUsers] = useState<Array<{ email: string }>>([]);
  const [oppColWidths, setOppColWidths] = useState<Record<string, number>>({});
  const [oppSort, setOppSort] = useState<SortState>(null);
  const [oppColFilters, setOppColFilters] = useState<Record<string, string>>({});
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [openedOpportunityFromQuery, setOpenedOpportunityFromQuery] = useState(false);
  const [boardPreviewFields, setBoardPreviewFields] = useState<string[]>([]);

  const selectedPipeline = useMemo(
    () => pipelines.find((p) => p.id === selectedPipelineId) ?? null,
    [pipelines, selectedPipelineId]
  );
  const selectedOppPipeline = useMemo(
    () => (selectedOpp ? pipelines.find((p) => p.id === selectedOpp.pipelineId) ?? null : null),
    [selectedOpp, pipelines]
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
        fetch("/api/custom-fields", {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      const adminsRes = await fetch("/api/admin-users", {
        credentials: "include",
        cache: "no-store",
      });

      for (const r of [pRes, oRes, cRes, cfRes, adminsRes]) {
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
      const adminsJson = (await adminsRes.json().catch(() => ({}))) as {
        ok?: boolean;
        users?: Array<{ email: string }>;
      };

      if (!pJson.ok) throw new Error(pJson.error ?? "שגיאה בטעינת pipelines");
      if (!oJson.ok) throw new Error(oJson.error ?? "שגיאה בטעינת opportunities");
      if (!cJson.ok) throw new Error(cJson.error ?? "שגיאה בטעינת contacts");

      const p = pJson.pipelines ?? [];
      setPipelines(p);
      const opp = oJson.opportunities ?? [];
      setOpportunities(opp);
      setContacts(cJson.rows ?? []);
      setAdminUsers(adminsJson.ok ? adminsJson.users ?? [] : []);
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
      setOppVisibleCols((prev) => {
        const available = [
          ...BASE_OPP_COLS,
          ...Array.from(
            new Set(opp.flatMap((o) => Object.keys((o.customValues ?? {}) as Record<string, unknown>)))
          ).sort(),
        ];
        return prev.length ? Array.from(new Set([...prev, ...available])) : available;
      });
      setBoardPreviewFields((prev) => {
        if (prev.length) return prev;
        const available = new Set([
          ...BASE_OPP_COLS,
          ...Array.from(
            new Set(opp.flatMap((o) => Object.keys((o.customValues ?? {}) as Record<string, unknown>)))
          ),
        ]);
        const defaults = ["contactName", "status", "stage", "assignedRep", "phone"];
        return defaults.filter((x) => available.has(x)).slice(0, 5);
      });
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

  useEffect(() => {
    if (openedOpportunityFromQuery) return;
    const openOpportunityId = searchParams.get("openOpportunityId")?.trim();
    if (!openOpportunityId || opportunities.length === 0) return;
    const target = opportunities.find((o) => o.id === openOpportunityId);
    if (!target) return;
    if (target.pipelineId && selectedPipelineId !== target.pipelineId) {
      setSelectedPipelineId(target.pipelineId);
    }
    void openOpportunityDetail(openOpportunityId);
    setOpenedOpportunityFromQuery(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, opportunities, selectedPipelineId, openedOpportunityFromQuery]);

  useEffect(() => {
    const saved =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem("crm:selectedPipelineId")
        : null;
    if (saved && !selectedPipelineId) {
      setSelectedPipelineId(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedPipelineId) return;
    window.sessionStorage.setItem("crm:selectedPipelineId", selectedPipelineId);
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
          status: newOppStatus,
          assignedRep: newOppAssignedRep,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "יצירת הזדמנות נכשלה");
      setCreateOpportunityOpen(false);
      setNewOppName("");
      setNewOppContactId("");
      setNewOppStage("");
      setNewOppStatus("פתוח");
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
      contactId?: string;
      stage?: string;
      pipelineId?: string;
      assignedRep?: string;
      customValues?: Record<string, unknown>;
      status?: "פתוח" | "זכיה" | "הפסד";
      email?: string;
      phone?: string;
      utmSource?: string;
      utmCampaign?: string;
      utmMedium?: string;
      utmContent?: string;
      landingpage?: string;
      tags?: string[];
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

  function formatJerusalemDate(raw: string | null | undefined): string {
    if (!raw) return "";
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return String(raw);
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(dt);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
  }

  function opportunityCell(o: Opportunity, col: string): string {
    if (col === "pipelineName") {
      return pipelines.find((p) => p.id === o.pipelineId)?.name || o.pipelineId;
    }
    if (col === "tags") return (o.tags ?? []).join(", ");
    if (col === "createdAt") return formatJerusalemDate(o.createdAt);
    if (col === "updatedAt") return formatJerusalemDate(o.updatedAt);
    if (col === "lastLeadAt") return formatJerusalemDate(o.lastLeadAt);
    if (col in o) return String((o as Record<string, unknown>)[col] ?? "");
    return String((o.customValues ?? {})[col] ?? "");
  }

  function opportunityFieldLabel(col: string): string {
    const labels: Record<string, string> = {
      name: "שם הזדמנות",
      contactName: "איש קשר",
      email: "מייל",
      phone: "פלאפון",
      pipelineName: "פייפליין",
      stage: "שלב",
      status: "סטטוס",
      utmSource: "utm_source",
      utmCampaign: "utm_campaign",
      utmMedium: "utm_medium",
      utmContent: "utm_content",
      landingpage: "landingpage",
      tags: "תגיות",
      assignedRep: "משויך",
      createdAt: "נוצר",
      updatedAt: "עודכן",
      lastLeadAt: "ליד אחרון",
    };
    return labels[col] ?? col;
  }

  const INLINE_READONLY = new Set([
    "createdAt",
    "updatedAt",
    "lastLeadAt",
    "pipelineName",
    "contactName",
    "contactEmail",
    "contactPhone",
    "contactId",
  ]);

  function startInlineEdit(o: Opportunity, col: string) {
    if (INLINE_READONLY.has(col)) return;
    const current =
      col === "tags" ? (o.tags ?? []).join(", ") : opportunityCell(o, col);
    setEditingCell({ id: o.id, col, value: current });
  }

  async function commitInlineEdit(o: Opportunity, col: string, rawValue: string) {
    if (INLINE_READONLY.has(col)) return;
    const value = rawValue.trim();
    if (col === "stage") {
      const pipeline = pipelines.find((p) => p.id === o.pipelineId);
      const allowedStages = pipeline?.stages ?? [];
      if (!value) return;
      if (allowedStages.length > 0 && !allowedStages.includes(value)) {
        setErr(`השלב חייב להיות אחד מהשלבים בפייפליין: ${allowedStages.join(" / ")}`);
        return;
      }
      await saveOpportunityPatch(o.id, { stage: value });
      return;
    }
    if (col === "status") {
      const status = value === "זכיה" || value === "הפסד" || value === "פתוח" ? value : "פתוח";
      await saveOpportunityPatch(o.id, { status });
      return;
    }
    if (col === "assignedRep") {
      await saveOpportunityPatch(o.id, { assignedRep: value });
      return;
    }
    if (col === "tags") {
      const tags = value.split(",").map((x) => x.trim()).filter(Boolean);
      await saveOpportunityPatch(o.id, { tags });
      return;
    }
    if (["name", "email", "phone", "utmSource", "utmCampaign", "utmMedium", "utmContent", "landingpage"].includes(col)) {
      await saveOpportunityPatch(o.id, { [col]: value } as Record<string, unknown>);
      return;
    }
    await saveOpportunityPatch(o.id, {
      customValues: { ...(o.customValues ?? {}), [col]: value },
    });
  }

  function onResizeColumnStart(col: string, startX: number) {
    const base = oppColWidths[col] ?? 180;
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(120, base + (ev.clientX - startX));
      setOppColWidths((prev) => ({ ...prev, [col]: next }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const filteredSortedOpps = useMemo(() => {
    const filtered = oppForSelectedPipeline.filter((o) =>
      oppDisplayCols.every((col) => {
        const q = (oppColFilters[col] ?? "").trim().toLowerCase();
        if (!q) return true;
        return opportunityCell(o, col).toLowerCase().includes(q);
      })
    );
    if (!oppSort) return filtered;
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      const av = opportunityCell(a, oppSort.col).toLowerCase();
      const bv = opportunityCell(b, oppSort.col).toLowerCase();
      if (av < bv) return oppSort.dir === "asc" ? -1 : 1;
      if (av > bv) return oppSort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [oppForSelectedPipeline, oppDisplayCols, oppColFilters, oppSort]);

  function toggleSort(col: string) {
    setOppSort((prev) => {
      if (!prev || prev.col !== col) return { col, dir: "asc" };
      return { col, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  }

  function moveOppColumn(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    setOppColumnOrder((arr) => {
      if (to >= arr.length || from >= arr.length) return arr;
      const next = [...arr];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
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

  function moveEditStage(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    setEditStages((arr) => {
      if (to >= arr.length) return arr;
      const next = [...arr];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
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
              {viewMode === "board" ? "ניהול שדות" : "ניהול עמודות"}
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
                      <th key={h} style={{ textAlign: "right", padding: "8px 10px", borderBottom: "2px solid #e5e7eb", background: "#f8fafc", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap", minWidth: oppColWidths[h] ?? 180, width: oppColWidths[h] ?? 180, position: "relative", verticalAlign: "top" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span>{h}</span>
                          <button
                            type="button"
                            onClick={() => toggleSort(h)}
                            style={{ border: "1px solid #e5e7eb", background: "#fff", borderRadius: 6, padding: "0 6px", cursor: "pointer", fontSize: 11, fontWeight: 800 }}
                            title="מיון עולה/יורד"
                          >
                            {oppSort?.col === h ? (oppSort.dir === "asc" ? "↑" : "↓") : "↕"}
                          </button>
                        </div>
                        <input
                          value={oppColFilters[h] ?? ""}
                          onChange={(e) =>
                            setOppColFilters((prev) => ({ ...prev, [h]: e.target.value }))
                          }
                          placeholder="חיפוש בעמודה..."
                          style={{ marginTop: 6, width: "100%", padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 11 }}
                        />
                        <div
                          onMouseDown={(e) => {
                            e.preventDefault();
                            onResizeColumnStart(h, e.clientX);
                          }}
                          style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 8, cursor: "col-resize" }}
                          title="גרור לשינוי רוחב"
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredSortedOpps.map((o) => (
                    <tr key={o.id}>
                      {oppDisplayCols.map((col, idx) => (
                        <td key={col} style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", minWidth: oppColWidths[col] ?? 180, width: oppColWidths[col] ?? 180 }}>
                          {col === "name" ? (
                            <button type="button" onClick={() => void openOpportunityDetail(o.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#4c1d95", fontWeight: 800, padding: 0 }}>
                              {opportunityCell(o, col)}
                            </button>
                          ) : (
                            editingCell?.id === o.id && editingCell.col === col ? (
                              col === "stage" ? (
                                <select
                                  autoFocus
                                  value={editingCell.value}
                                  onChange={(e) =>
                                    setEditingCell((x) => (x ? { ...x, value: e.target.value } : x))
                                  }
                                  onBlur={() => {
                                    void commitInlineEdit(o, col, editingCell.value);
                                    setEditingCell(null);
                                  }}
                                  style={{ width: "100%", padding: "7px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}
                                >
                                  {(pipelines.find((p) => p.id === o.pipelineId)?.stages ?? []).map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                </select>
                              ) : col === "status" ? (
                                <select
                                  autoFocus
                                  value={editingCell.value || "פתוח"}
                                  onChange={(e) =>
                                    setEditingCell((x) => (x ? { ...x, value: e.target.value } : x))
                                  }
                                  onBlur={() => {
                                    void commitInlineEdit(o, col, editingCell.value);
                                    setEditingCell(null);
                                  }}
                                  style={{ width: "100%", padding: "7px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}
                                >
                                  {["פתוח", "זכיה", "הפסד"].map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                </select>
                              ) : col === "assignedRep" ? (
                                <select
                                  autoFocus
                                  value={editingCell.value}
                                  onChange={(e) =>
                                    setEditingCell((x) => (x ? { ...x, value: e.target.value } : x))
                                  }
                                  onBlur={() => {
                                    void commitInlineEdit(o, col, editingCell.value);
                                    setEditingCell(null);
                                  }}
                                  style={{ width: "100%", padding: "7px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}
                                >
                                  <option value="">לא משויך</option>
                                  {adminUsers.map((u) => (
                                    <option key={u.email} value={u.email}>{u.email}</option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  autoFocus
                                  value={editingCell.value}
                                  onChange={(e) =>
                                    setEditingCell((x) => (x ? { ...x, value: e.target.value } : x))
                                  }
                                  onBlur={() => {
                                    void commitInlineEdit(o, col, editingCell.value);
                                    setEditingCell(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      void commitInlineEdit(o, col, editingCell.value);
                                      setEditingCell(null);
                                    }
                                    if (e.key === "Escape") setEditingCell(null);
                                  }}
                                  style={{ width: "100%", padding: "7px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}
                                />
                              )
                            ) : (
                              <button
                                type="button"
                                disabled={INLINE_READONLY.has(col)}
                                onClick={() => startInlineEdit(o, col)}
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  cursor: INLINE_READONLY.has(col) ? "default" : "pointer",
                                  padding: 0,
                                  textAlign: "right",
                                  width: "100%",
                                  color: INLINE_READONLY.has(col) ? "#374151" : "#111827",
                                }}
                                title={INLINE_READONLY.has(col) ? "" : "לחץ לעריכה מהירה"}
                              >
                                {opportunityCell(o, col)}
                              </button>
                            )
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!loading && filteredSortedOpps.length === 0 && <tr><td colSpan={Math.max(oppDisplayCols.length, 1)} style={{ padding: 16, color: "#6b7280", fontWeight: 700 }}>אין הזדמנויות בפייפליין הנבחר.</td></tr>}
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
                              <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                                {boardPreviewFields.slice(0, 5).map((f) => (
                                  <div key={`${o.id}-${f}`} style={{ fontSize: 12, color: "#4b5563", display: "flex", gap: 6 }}>
                                    <span style={{ fontWeight: 800 }}>{opportunityFieldLabel(f)}:</span>
                                    <span style={{ color: "#6b7280", wordBreak: "break-word" }}>
                                      {opportunityCell(o, f) || "—"}
                                    </span>
                                  </div>
                                ))}
                                {boardPreviewFields.length === 0 && (
                                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                                    {o.contactName || o.contactEmail || o.contactPhone || o.contactId}
                                  </div>
                                )}
                              </div>
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
                <div
                  key={`${i}-${s}`}
                  draggable
                  onDragStart={() => setEditDragIndex(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (editDragIndex != null) moveEditStage(editDragIndex, i);
                    setEditDragIndex(null);
                  }}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    gap: 8,
                    alignItems: "center",
                    border: "1px solid #f3f4f6",
                    borderRadius: 10,
                    padding: 6,
                  }}
                >
                  <span style={{ cursor: "grab", opacity: 0.7 }} title="גרור לשינוי סדר">
                    ⋮⋮
                  </span>
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
                    onClick={() => {
                      if (editStages.length <= 1) {
                        window.alert("פייפליין חייב להכיל לפחות שלב אחד.");
                        return;
                      }
                      const prevStage = editStages[i - 1] || editStages[0];
                      const ok = window.confirm(
                        `למחוק את השלב "${s}"?\nההזדמנויות בשלב זה יעברו לשלב הקודם: "${prevStage}".`
                      );
                      if (!ok) return;
                      setEditStages((arr) => arr.filter((_, idx) => idx !== i));
                    }}
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
              <select value={newOppStatus} onChange={(e) => setNewOppStatus(e.target.value as "פתוח" | "זכיה" | "הפסד")} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}>
                {["פתוח", "זכיה", "הפסד"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select value={newOppAssignedRep} onChange={(e) => setNewOppAssignedRep(e.target.value)} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}>
                <option value="">נציג משויך</option>
                {adminUsers.map((u) => (
                  <option key={u.email} value={u.email}>{u.email}</option>
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

      {manageOppColsOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 90 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.2)" }} onMouseDown={() => setManageOppColsOpen(false)} />
          <div style={{ position: "absolute", top: 0, right: 0, height: "100%", width: "min(420px, 94vw)", overflow: "auto", background: "#fff", borderLeft: "1px solid #e5e7eb", padding: 16 }} onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, marginBottom: 10 }}>
              {viewMode === "board" ? "ניהול שדות (תצוגת פייפליין)" : "ניהול עמודות (הזדמנויות)"}
            </h3>
            {viewMode === "board" ? (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                  אפשר לבחור עד 5 שדות לתצוגה מקדימה על הכרטיס.
                </div>
                {[...BASE_OPP_COLS, ...oppCustomFieldIds]
                  .filter((h) => h !== "name")
                  .map((h) => {
                    const selected = boardPreviewFields.includes(h);
                    const maxReached = boardPreviewFields.length >= 5 && !selected;
                    return (
                      <label
                        key={h}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          border: "1px solid #f3f4f6",
                          borderRadius: 10,
                          padding: "8px 10px",
                          opacity: maxReached ? 0.6 : 1,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={maxReached}
                          onChange={(e) =>
                            setBoardPreviewFields((arr) =>
                              e.target.checked
                                ? [...arr, h].slice(0, 5)
                                : arr.filter((x) => x !== h)
                            )
                          }
                        />
                        <span>{opportunityFieldLabel(h)}</span>
                      </label>
                    );
                  })}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {(oppColumnOrder.length
                  ? oppColumnOrder
                  : [...BASE_OPP_COLS, ...oppCustomFieldIds]).map((h, idx, arr) => (
                  <div
                    key={h}
                    draggable
                    onDragStart={() => setOppDragIndex(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (oppDragIndex != null) moveOppColumn(oppDragIndex, idx);
                      setOppDragIndex(null);
                    }}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto auto",
                      alignItems: "center",
                      gap: 8,
                      border: "1px solid #f3f4f6",
                      borderRadius: 10,
                      padding: "6px 8px",
                    }}
                  >
                    <span style={{ cursor: "grab", opacity: 0.7 }} title="גרור לשינוי סדר">
                      ⋮⋮
                    </span>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={oppVisibleCols.includes(h)}
                        onChange={(e) =>
                          setOppVisibleCols((vis) =>
                            e.target.checked ? Array.from(new Set([...vis, h])) : vis.filter((x) => x !== h)
                          )
                        }
                      />
                      <span>{h}</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => moveOppColumn(idx, idx - 1)}
                      disabled={idx === 0}
                      style={{
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        borderRadius: 8,
                        padding: "4px 7px",
                        cursor: idx === 0 ? "default" : "pointer",
                        opacity: idx === 0 ? 0.5 : 1,
                      }}
                      title="הזז למעלה"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveOppColumn(idx, idx + 1)}
                      disabled={idx === arr.length - 1}
                      style={{
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        borderRadius: 8,
                        padding: "4px 7px",
                        cursor: idx === arr.length - 1 ? "default" : "pointer",
                        opacity: idx === arr.length - 1 ? 0.5 : 1,
                      }}
                      title="הזז למטה"
                    >
                      ↓
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setManageOppColsOpen(false)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>סגור</button>
            </div>
          </div>
        </div>
      )}

      {selectedOpp && (
        <div style={{ position: "fixed", inset: 0, zIndex: 96 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.2)" }} onMouseDown={() => setSelectedOpp(null)} />
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 12 }}>
            <div style={{ width: "min(980px, 96vw)", maxHeight: "92vh", overflow: "auto", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16 }} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 22 }}>{selectedOpp.name}</h3>
              <button
                type="button"
                onClick={() => setSelectedOpp(null)}
                style={{ border: "1px solid #e5e7eb", background: "#fff", borderRadius: 10, padding: "6px 10px", cursor: "pointer", fontWeight: 800 }}
                title="סגור"
              >
                ✕
              </button>
            </div>
            <div style={{ display: "inline-flex", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", marginBottom: 10 }}>
              {(["details", "notes", "tasks"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setOppDetailTab(t)} style={{ border: "none", background: oppDetailTab === t ? "#ede9fe" : "#fff", padding: "8px 10px", cursor: "pointer", fontWeight: 800 }}>
                  {t === "details" ? "פרטים" : t === "notes" ? "פתקים" : "משימות"}
                </button>
              ))}
            </div>
            {oppDetailTab === "details" && (
              <div style={{ marginTop: 4, display: "grid", gap: 16 }}>
                <div style={{ border: "1px solid #f3f4f6", borderRadius: 12, padding: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>Contact details</div>
                  <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>שם איש קשר</span>
                      <input value={selectedOpp.contactName ?? ""} readOnly style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#f9fafb" }} />
                    </label>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>פלאפון איש קשר</span>
                      <input value={selectedOpp.contactPhone ?? ""} readOnly style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#f9fafb" }} />
                    </label>
                    <label style={{ display: "grid", gap: 4, gridColumn: "1 / -1" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>מייל איש קשר</span>
                      <input value={selectedOpp.contactEmail ?? ""} readOnly style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#f9fafb" }} />
                    </label>
                    <label style={{ display: "grid", gap: 4, gridColumn: "1 / -1" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>איש קשר ראשי (לא ניתן לשינוי)</span>
                      <input
                        value={selectedOpp.contactId}
                        readOnly
                        style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#f9fafb" }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const id = selectedOpp.contactId;
                        if (!id) return;
                        window.location.href = `/contacts?openContactId=${encodeURIComponent(id)}`;
                      }}
                      style={{ gridColumn: "1 / -1", padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontWeight: 800 }}
                    >
                      פתח איש קשר
                    </button>
                  </div>
                </div>

                <div style={{ border: "1px solid #f3f4f6", borderRadius: 12, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ fontWeight: 900 }}>Opportunity details</div>
                    <div style={{ flex: 1 }} />
                    <button
                      type="button"
                      onClick={() => {
                        window.location.href = "/settings/fields";
                      }}
                      style={{
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        borderRadius: 8,
                        padding: "6px 8px",
                        cursor: "pointer",
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      ניהול שדות
                    </button>
                  </div>
                  <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
                <label style={{ display: "grid", gap: 4, gridColumn: "1 / -1" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>שם הזדמנות</span>
                  <input value={selectedOpp.name} onChange={(e) => setSelectedOpp((x) => (x ? { ...x, name: e.target.value } : x))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>מייל</span>
                  <input value={selectedOpp.email ?? ""} onChange={(e) => setSelectedOpp((x) => (x ? { ...x, email: e.target.value } : x))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>פלאפון</span>
                  <input value={selectedOpp.phone ?? ""} onChange={(e) => setSelectedOpp((x) => (x ? { ...x, phone: e.target.value } : x))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>שלב בפייפליין</span>
                  <select value={selectedOpp.stage} onChange={(e) => setSelectedOpp((x) => (x ? { ...x, stage: e.target.value } : x))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                    {(selectedOppPipeline?.stages ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>סטטוס</span>
                  <select value={selectedOpp.status ?? "פתוח"} onChange={(e) => setSelectedOpp((x) => (x ? { ...x, status: e.target.value as "פתוח" | "זכיה" | "הפסד" } : x))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                    {["פתוח", "זכיה", "הפסד"].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>נציג משויך</span>
                  <select value={selectedOpp.assignedRep ?? ""} onChange={(e) => setSelectedOpp((x) => (x ? { ...x, assignedRep: e.target.value } : x))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                    <option value="">לא משויך</option>
                    {adminUsers.map((u) => (
                      <option key={u.email} value={u.email}>{u.email}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>utm_source</span>
                  <input value={selectedOpp.utmSource ?? ""} onChange={(e) => setSelectedOpp((x) => (x ? { ...x, utmSource: e.target.value } : x))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>utm_campaign</span>
                  <input value={selectedOpp.utmCampaign ?? ""} onChange={(e) => setSelectedOpp((x) => (x ? { ...x, utmCampaign: e.target.value } : x))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>utm_medium</span>
                  <input value={selectedOpp.utmMedium ?? ""} onChange={(e) => setSelectedOpp((x) => (x ? { ...x, utmMedium: e.target.value } : x))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>utm_content</span>
                  <input value={selectedOpp.utmContent ?? ""} onChange={(e) => setSelectedOpp((x) => (x ? { ...x, utmContent: e.target.value } : x))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                </label>
                <label style={{ display: "grid", gap: 4, gridColumn: "1 / -1" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>landingpage</span>
                  <input value={selectedOpp.landingpage ?? ""} onChange={(e) => setSelectedOpp((x) => (x ? { ...x, landingpage: e.target.value } : x))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                </label>
                <label style={{ display: "grid", gap: 4, gridColumn: "1 / -1" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>תגיות</span>
                  <input value={(selectedOpp.tags ?? []).join(", ")} onChange={(e) => setSelectedOpp((x) => (x ? { ...x, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) } : x))} placeholder="מופרדות בפסיק" style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                </label>
                {oppCustomFieldIds.map((fid) => (
                  <label key={fid} style={{ display: "grid", gap: 4, gridColumn: "1 / -1" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{fid}</span>
                    <input value={String((selectedOpp.customValues ?? {})[fid] ?? "")} onChange={(e) => setSelectedOpp((x) => (x ? { ...x, customValues: { ...(x.customValues ?? {}), [fid]: e.target.value } } : x))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                  </label>
                ))}
                <button type="button" onClick={() => void saveOpportunityPatch(selectedOpp.id, { name: selectedOpp.name, email: selectedOpp.email ?? "", phone: selectedOpp.phone ?? "", stage: selectedOpp.stage, status: selectedOpp.status ?? "פתוח", pipelineId: selectedOpp.pipelineId, assignedRep: selectedOpp.assignedRep ?? "", utmSource: selectedOpp.utmSource ?? "", utmCampaign: selectedOpp.utmCampaign ?? "", utmMedium: selectedOpp.utmMedium ?? "", utmContent: selectedOpp.utmContent ?? "", landingpage: selectedOpp.landingpage ?? "", tags: selectedOpp.tags ?? [], customValues: selectedOpp.customValues ?? {} })} style={{ gridColumn: "1 / -1", padding: "9px 12px", borderRadius: 10, border: "none", background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)", color: "#fff", fontWeight: 800, cursor: "pointer" }}>שמור ועדכן</button>
                  </div>
                </div>
              </div>
            )}
            {oppDetailTab === "notes" && (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                {oppNotes.map((n) => (
                  <div key={n.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, background: "#fff" }}>
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{n.text}</div>
                    <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
                      נוצר על ידי: {n.createdBy ?? "CRM User"} · {n.createdAt}
                    </div>
                  </div>
                ))}
                <textarea
                  value={newOppNoteText}
                  onChange={(e) => setNewOppNoteText(e.target.value)}
                  placeholder="כתוב פתק חדש..."
                  style={{ minHeight: 140, padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", lineHeight: 1.55 }}
                />
                <button type="button" onClick={() => {
                  const text = newOppNoteText.trim();
                  if (!text) return;
                  const notes = [...oppNotes, { id: crypto.randomUUID(), text, createdAt: new Date().toISOString(), createdBy: "CRM User" }];
                  setOppNotes(notes);
                  setNewOppNoteText("");
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
          </div></div>
        </div>
      )}
    </div>
  );
}


"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type LeadsOk = {
  ok: true;
  headers: string[];
  count: number;
  rows: Record<string, string>[];
};
type LeadsErr = { ok: false; error: string };

type SortDir = "asc" | "desc";
type AdvOp = "contains" | "equals" | "startsWith" | "isEmpty" | "notEmpty";
type AdvFilter = { id: string; field: string; op: AdvOp; value: string };
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
type ContactDetail = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  stage: string;
  status?: "פתוח" | "זכיה" | "הפסד";
  assignedRep?: string;
  customFields?: Record<string, unknown>;
  notes?: NoteItem[];
  tasks?: TaskItem[];
};

const BASE_COLS = ["name", "phone", "email", "stage", "createdAt"];

function normalize(v: unknown) {
  return String(v ?? "").trim().toLowerCase();
}

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function parseCsv(text: string): string[][] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  return lines.map((l) => l.split(",").map((x) => x.trim()));
}

export default function ContactsClient() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [count, setCount] = useState(0);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [columnFilterOpen, setColumnFilterOpen] = useState<string | null>(null);
  const filterWrapRef = useRef<HTMLDivElement>(null);

  const [visibleCols, setVisibleCols] = useState<string[]>([]);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [manageColsOpen, setManageColsOpen] = useState(false);
  const [draftVisibleCols, setDraftVisibleCols] = useState<string[]>([]);
  const [draftColumnOrder, setDraftColumnOrder] = useState<string[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const [advOpen, setAdvOpen] = useState(false);
  const [advFilters, setAdvFilters] = useState<AdvFilter[]>([]);
  const [draftAdvFilters, setDraftAdvFilters] = useState<AdvFilter[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createStage, setCreateStage] = useState("Pending");
  const [createStatus, setCreateStatus] = useState<"פתוח" | "זכיה" | "הפסד">("פתוח");
  const [createAssignedRep, setCreateAssignedRep] = useState("");
  const [savingCreate, setSavingCreate] = useState(false);

  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<"details" | "notes" | "tasks">("details");
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [savingDetail, setSavingDetail] = useState(false);
  const openedFromQueryRef = useRef(false);
  const [adminUsers, setAdminUsers] = useState<Array<{ email: string }>>([]);
  const [detailOpportunities, setDetailOpportunities] = useState<
    Array<{ id: string; name: string; pipelineId: string; stage: string }>
  >([]);
  const [detailAggNotes, setDetailAggNotes] = useState<NoteItem[]>([]);
  const [detailAggTasks, setDetailAggTasks] = useState<TaskItem[]>([]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (dateFrom.trim()) params.set("date_from", dateFrom.trim());
    if (dateTo.trim()) params.set("date_to", dateTo.trim());
    const q = params.toString();
    return q ? `?${q}` : "";
  }, [dateFrom, dateTo]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/contacts${query}`, { credentials: "include", cache: "no-store" });
      if (res.status === 401) {
        window.location.href = `/login?returnTo=${encodeURIComponent("/contacts")}`;
        return;
      }
      if (res.status === 403) {
        window.location.href = `/pending?returnTo=${encodeURIComponent("/contacts")}`;
        return;
      }

      const json = (await res.json().catch(() => ({}))) as LeadsOk | LeadsErr;
      if (!json || json.ok !== true) {
        setErr("שגיאה בטעינת contacts");
        return;
      }

      setHeaders(json.headers ?? []);
      setRows(json.rows ?? []);
      setCount(json.count ?? 0);
      setVisibleCols((prev) => {
        if (prev.length) return prev;
        const hs = json.headers ?? [];
        const initial = BASE_COLS.filter((c) => hs.includes(c));
        const rest = hs.filter((h) => !initial.includes(h)).slice(0, 3);
        return [...initial, ...rest];
      });
      setColumnOrder((prev) => {
        if (prev.length) return prev;
        const hs = json.headers ?? [];
        const initial = BASE_COLS.filter((c) => hs.includes(c));
        const rest = hs.filter((h) => !initial.includes(h));
        return [...initial, ...rest];
      });
    } catch {
      setErr("לא ניתן לטעון contacts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    if (openedFromQueryRef.current) return;
    const openContactId = searchParams.get("openContactId")?.trim();
    if (!openContactId) return;
    openedFromQueryRef.current = true;
    void openDetailById(openContactId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!columnFilterOpen) return;
    function onDoc(e: MouseEvent) {
      if (!filterWrapRef.current?.contains(e.target as Node)) {
        setColumnFilterOpen(null);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [columnFilterOpen]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin-users", {
          credentials: "include",
          cache: "no-store",
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          users?: Array<{ email: string }>;
        };
        if (res.ok && j.ok) setAdminUsers(j.users ?? []);
      } catch {}
    })();
  }, []);

  const filteredRows = useMemo(() => {
    const q = normalize(search);
    let out = rows;

    if (q) {
      out = out.filter((r) =>
        headers.some((h) => normalize(r[h]).includes(q))
      );
    }

    out = out.filter((r) => {
      for (const [h, val] of Object.entries(columnFilters)) {
        if (!val?.trim()) continue;
        if (!normalize(r[h]).includes(normalize(val))) return false;
      }
      return true;
    });

    out = out.filter((r) => {
      for (const f of advFilters) {
        const v = String(r[f.field] ?? "");
        const vN = normalize(v);
        const cN = normalize(f.value);
        if (f.op === "contains" && !vN.includes(cN)) return false;
        if (f.op === "equals" && vN !== cN) return false;
        if (f.op === "startsWith" && !vN.startsWith(cN)) return false;
        if (f.op === "isEmpty" && v.trim() !== "") return false;
        if (f.op === "notEmpty" && v.trim() === "") return false;
      }
      return true;
    });

    const sf = sortField;
    out = [...out].sort((a, b) => {
      const av = String(a[sf] ?? "");
      const bv = String(b[sf] ?? "");
      const cmp = av.localeCompare(bv, "he", { numeric: true, sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [rows, headers, search, columnFilters, advFilters, sortField, sortDir]);

  const displayHeaders = useMemo(() => {
    const order = columnOrder.length ? columnOrder : headers;
    if (!visibleCols.length) return order;
    return order.filter((h) => visibleCols.includes(h));
  }, [visibleCols, headers, columnOrder]);

  function toggleSort(field: string) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDir("asc");
  }

  function exportCsv(onlyFiltered: boolean) {
    const rowsToExport = onlyFiltered ? filteredRows : rows;
    const cols = displayHeaders;
    const lines = [
      cols.map(csvEscape).join(","),
      ...rowsToExport.map((r) => cols.map((c) => csvEscape(r[c] ?? "")).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contacts-${onlyFiltered ? "filtered" : "all"}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function createContact() {
    setSavingCreate(true);
    setErr(null);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName,
          phone: createPhone,
          email: createEmail,
          stage: createStage || "Pending",
          status: createStatus,
          assignedRep: createAssignedRep,
          source: "manual",
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "יצירת איש קשר נכשלה");
        return;
      }
      setCreateOpen(false);
      setCreateName("");
      setCreatePhone("");
      setCreateEmail("");
      setCreateStage("Pending");
      setCreateStatus("פתוח");
      setCreateAssignedRep("");
      await load();
    } catch {
      setErr("יצירת איש קשר נכשלה");
    } finally {
      setSavingCreate(false);
    }
  }

  async function openDetailById(id: string) {
    setErr(null);
    try {
      const res = await fetch(`/api/contacts/${encodeURIComponent(id)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        lead?: ContactDetail;
        opportunities?: Array<{ id: string; name: string; pipelineId: string; stage: string }>;
        aggregatedNotes?: NoteItem[];
        aggregatedTasks?: TaskItem[];
      };
      if (!res.ok || !j.ok || !j.lead) throw new Error(j.error ?? "טעינת איש קשר נכשלה");
      setDetail(j.lead);
      setDetailOpportunities(j.opportunities ?? []);
      setDetailAggNotes(j.aggregatedNotes ?? []);
      setDetailAggTasks(j.aggregatedTasks ?? []);
      setDetailTab("details");
      setDetailOpen(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "טעינת איש קשר נכשלה");
    }
  }

  async function saveDetail(next: Partial<ContactDetail>) {
    if (!detail) return;
    setSavingDetail(true);
    setErr(null);
    try {
      const res = await fetch(`/api/contacts/${encodeURIComponent(detail.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        lead?: ContactDetail;
      };
      if (!res.ok || !j.ok || !j.lead) throw new Error(j.error ?? "שמירה נכשלה");
      setDetail(j.lead);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שמירה נכשלה");
    } finally {
      setSavingDetail(false);
    }
  }

  async function importCsv(file: File) {
    setImporting(true);
    setImportResult(null);
    setErr(null);
    try {
      const text = await file.text();
      const matrix = parseCsv(text);
      if (matrix.length < 2) {
        setErr("CSV חייב להכיל שורת כותרות לפחות ועוד שורה אחת");
        return;
      }
      const csvHeaders = matrix[0];
      const bodyRows = matrix.slice(1).map((r) => {
        const obj: Record<string, string> = {};
        csvHeaders.forEach((h, i) => (obj[h] = r[i] ?? ""));
        return {
          name: obj.name ?? obj["contact name"] ?? obj["full name"] ?? "",
          email: obj.email ?? obj.Email ?? "",
          phone: obj.phone ?? obj.Phone ?? "",
          stage: obj.stage ?? "Pending",
          source: "csv-import",
          customFields: Object.fromEntries(
            Object.entries(obj).filter(([k]) => !["name", "contact name", "full name", "email", "Email", "phone", "Phone", "stage"].includes(k))
          ),
        };
      });

      const res = await fetch("/api/contacts/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: bodyRows }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        total?: number;
        success?: number;
        failed?: number;
      };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "ייבוא נכשל");
        return;
      }
      setImportResult(`הייבוא הסתיים: ${j.success ?? 0} הצליחו, ${j.failed ?? 0} נכשלו`);
      await load();
    } catch {
      setErr("ייבוא CSV נכשל");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function openManageColumns() {
    const order = columnOrder.length ? columnOrder : headers;
    const visible = visibleCols.length ? visibleCols : headers;
    setDraftColumnOrder(order);
    setDraftVisibleCols(visible);
    setManageColsOpen(true);
  }

  function applyManageColumns() {
    setColumnOrder(draftColumnOrder);
    setVisibleCols(draftVisibleCols);
    setManageColsOpen(false);
  }

  function resetColumnsToDefault() {
    const initial = BASE_COLS.filter((c) => headers.includes(c));
    const rest = headers.filter((h) => !initial.includes(h));
    const order = [...initial, ...rest];
    setDraftColumnOrder(order);
    setDraftVisibleCols(order);
  }

  function moveDraftColumn(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    setDraftColumnOrder((arr) => {
      if (to >= arr.length) return arr;
      const next = [...arr];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function addCustomFieldColumn() {
    const raw = window.prompt("שם שדה מותאם (מפתח פנימי באנגלית/עברית ללא פסיקים):");
    const name = (raw ?? "").trim();
    if (!name) return;
    if (headers.includes(name)) {
      window.alert("השדה כבר קיים.");
      return;
    }
    setHeaders((hs) => [...hs, name]);
    setRows((rs) => rs.map((r) => ({ ...r, [name]: r[name] ?? "" })));
    setDraftColumnOrder((arr) => [...arr, name]);
    setDraftVisibleCols((arr) => [...arr, name]);
  }

  function openAdvancedFilters() {
    setDraftAdvFilters(advFilters.length ? [...advFilters] : []);
    setAdvOpen(true);
  }

  function applyAdvancedFilters() {
    setAdvFilters(draftAdvFilters);
    setAdvOpen(false);
  }

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>אנשי קשר</h1>
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
          {filteredRows.length} / {count}
        </span>

        <div style={{ flex: 1 }} />

        <button
          type="button"
          onClick={openManageColumns}
          style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", fontWeight: 700, cursor: "pointer" }}
        >
          ניהול עמודות
        </button>
        <button
          type="button"
          onClick={openAdvancedFilters}
          style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", fontWeight: 700, cursor: "pointer" }}
        >
          פילטר מתקדם
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", fontWeight: 700, cursor: "pointer" }}
        >
          {importing ? "מייבא..." : "ייבוא אנשי קשר"}
        </button>
        <button
          type="button"
          onClick={() => exportCsv(true)}
          style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", fontWeight: 700, cursor: "pointer" }}
        >
          ייצוא CSV (מסונן)
        </button>
        <button
          type="button"
          onClick={() => exportCsv(false)}
          style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", fontWeight: 700, cursor: "pointer" }}
        >
          ייצוא הכל
        </button>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "none",
            background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
            color: "#fff",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          יצירת איש קשר
        </button>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importCsv(f);
          }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>מתאריך</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>עד תאריך</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 300 }}>
          <label style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>חיפוש אנשי קשר</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי כל שדה..."
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}
          />
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ fontSize: 14, fontWeight: 800, color: "#6b7280" }}>
          {loading ? "טוען…" : `${filteredRows.length} רשומות מוצגות`}
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          overflow: "hidden",
          width: "100%",
          maxWidth: "100%",
        }}
      >
        <div style={{ padding: 14, borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>טבלת אנשי קשר</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
            קליטה וניהול מתוך ה-CRM (Firestore). אפשר למיין, לסנן, להסתיר/להציג עמודות, לייבא ולייצא.
          </div>
        </div>

        {err && (
          <div style={{ padding: 14, background: "#fef2f2", borderTop: "1px solid #fecaca", color: "#b91c1c" }}>
            {err}
          </div>
        )}

        {!loading && headers.length > 0 ? (
          <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 600, maxWidth: "100%" }}>
            <table style={{ minWidth: 980, width: "max-content", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {displayHeaders.map((h) => (
                    <th
                      key={h}
                      style={{
                        position: "sticky",
                        top: 0,
                        background: "#f5f3ff",
                        padding: "10px 12px",
                        borderBottom: "2px solid #e9d5ff",
                        textAlign: "right",
                        fontWeight: 900,
                        fontSize: 12,
                        whiteSpace: "nowrap",
                      }}
                    >
                        <div ref={filterWrapRef} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => toggleSort(h)}
                            style={{ border: "none", background: "transparent", cursor: "pointer", fontWeight: 900 }}
                            title="מיין לפי עמודה"
                          >
                            {h} {sortField === h ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setColumnFilterOpen((cur) => (cur === h ? null : h))}
                            style={{ border: "none", background: "transparent", cursor: "pointer" }}
                            title="פילטר בעמודה"
                          >
                            ⌕
                          </button>
                          {columnFilterOpen === h && (
                            <div
                              style={{
                                position: "absolute",
                                marginTop: 120,
                                background: "#fff",
                                border: "1px solid #e5e7eb",
                                borderRadius: 12,
                                padding: 8,
                                boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                                zIndex: 60,
                                minWidth: 220,
                              }}
                            >
                              <input
                                placeholder={`פילטר ${h}`}
                                value={columnFilters[h] ?? ""}
                                onChange={(e) =>
                                  setColumnFilters((f) => ({ ...f, [h]: e.target.value }))
                                }
                                style={{
                                  width: "100%",
                                  padding: "8px 10px",
                                  borderRadius: 10,
                                  border: "1px solid #e5e7eb",
                                }}
                              />
                              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                <button
                                  type="button"
                                  onClick={() => setColumnFilterOpen(null)}
                                  style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
                                >
                                  סגור
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setColumnFilters((f) => {
                                      const x = { ...f };
                                      delete x[h];
                                      return x;
                                    })
                                  }
                                  style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
                                >
                                  נקה
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, i) => (
                  <tr key={i}>
                    {displayHeaders.map((h, cellIdx) => (
                      <td
                        key={h}
                        style={{
                          padding: "10px 12px",
                          borderBottom: "1px solid #f3f4f6",
                          verticalAlign: "top",
                          fontSize: 12,
                          maxWidth: 360,
                          wordBreak: "break-word",
                        }}
                      >
                        {cellIdx === 0 && row.id ? (
                          <button
                            type="button"
                            onClick={() => void openDetailById(String(row.id))}
                            style={{
                              border: "none",
                              background: "transparent",
                              cursor: "pointer",
                              color: "#4c1d95",
                              fontWeight: 800,
                              padding: 0,
                            }}
                          >
                            {row[h] ?? ""}
                          </button>
                        ) : (
                          row[h] ?? ""
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: 16, color: "#6b7280", fontWeight: 700 }}>
            {loading ? "טוען…" : "אין נתונים"}
          </div>
        )}
      </div>

      {importResult && (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 12, background: "#ecfeff", color: "#155e75", border: "1px solid #a5f3fc", fontWeight: 700 }}>
          {importResult}
        </div>
      )}

      {manageColsOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 90 }}>
          <div
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.2)" }}
            onMouseDown={() => setManageColsOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              height: "100%",
              width: "min(420px, 94vw)",
              overflow: "auto",
              background: "#fff",
              borderLeft: "1px solid #e5e7eb",
              padding: 16,
              boxShadow: "-12px 0 30px rgba(0,0,0,0.08)",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, marginBottom: 10 }}>ניהול עמודות</h3>
            <input
              placeholder="Search field"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                marginBottom: 10,
              }}
            />
            <div style={{ display: "grid", gap: 8 }}>
              {draftColumnOrder.map((h, i) => {
                const checked = draftVisibleCols.includes(h);
                return (
                  <div
                    key={h}
                    draggable
                    onDragStart={() => setDragIndex(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragIndex != null) moveDraftColumn(dragIndex, i);
                      setDragIndex(null);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 4px",
                      borderRadius: 8,
                      border: "1px solid #f3f4f6",
                    }}
                  >
                    <span title="גרור" style={{ cursor: "grab", opacity: 0.7 }}>
                      ⋮⋮
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setDraftVisibleCols((cols) =>
                          e.target.checked ? [...cols, h] : cols.filter((x) => x !== h)
                        )
                      }
                    />
                    <span>{h}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={addCustomFieldColumn}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
              >
                Add custom field
              </button>
              <button
                type="button"
                onClick={resetColumnsToDefault}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
              >
                סדר ברירת מחדל
              </button>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setManageColsOpen(false)}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyManageColumns}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {advOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 90 }}>
          <div
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.2)" }}
            onMouseDown={() => setAdvOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              height: "100%",
              width: "min(420px, 94vw)",
              overflow: "auto",
              background: "#fff",
              borderLeft: "1px solid #e5e7eb",
              padding: 16,
              boxShadow: "-12px 0 30px rgba(0,0,0,0.08)",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, marginBottom: 10 }}>פילטר מתקדם</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {draftAdvFilters.map((f) => (
                <div key={f.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1.4fr auto", gap: 8 }}>
                  <select value={f.field} onChange={(e) => setDraftAdvFilters((arr) => arr.map((x) => (x.id === f.id ? { ...x, field: e.target.value } : x)))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                  <select value={f.op} onChange={(e) => setDraftAdvFilters((arr) => arr.map((x) => (x.id === f.id ? { ...x, op: e.target.value as AdvOp } : x)))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                    <option value="contains">כולל</option>
                    <option value="equals">שווה בדיוק</option>
                    <option value="startsWith">מתחיל ב...</option>
                    <option value="isEmpty">ריק</option>
                    <option value="notEmpty">לא ריק</option>
                  </select>
                  <input value={f.value} onChange={(e) => setDraftAdvFilters((arr) => arr.map((x) => (x.id === f.id ? { ...x, value: e.target.value } : x)))} disabled={f.op === "isEmpty" || f.op === "notEmpty"} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                  <button
                    type="button"
                    onClick={() => setDraftAdvFilters((arr) => arr.filter((x) => x.id !== f.id))}
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
                  >
                    מחק
                  </button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() =>
                  setDraftAdvFilters((arr) => [
                    ...arr,
                    {
                      id: crypto.randomUUID(),
                      field: headers[0] ?? "name",
                      op: "contains",
                      value: "",
                    },
                  ])
                }
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
              >
                הוסף תנאי
              </button>
              <button
                type="button"
                onClick={() => setDraftAdvFilters([])}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
              >
                נקה הכל
              </button>
              <button
                type="button"
                onClick={() => setAdvOpen(false)}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyAdvancedFilters}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {createOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.2)",
            display: "grid",
            placeItems: "center",
            zIndex: 80,
          }}
          onMouseDown={() => setCreateOpen(false)}
        >
          <div
            style={{ width: "min(540px, 94vw)", background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", padding: 16 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, marginBottom: 10 }}>יצירת איש קשר</h3>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <input placeholder="שם מלא" value={createName} onChange={(e) => setCreateName(e.target.value)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
              <input placeholder="טלפון" value={createPhone} onChange={(e) => setCreatePhone(e.target.value)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
              <input placeholder="אימייל" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", gridColumn: "1 / -1" }} />
              <input placeholder="שלב" value={createStage} onChange={(e) => setCreateStage(e.target.value)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", gridColumn: "1 / -1" }} />
              <select value={createStatus} onChange={(e) => setCreateStatus(e.target.value as "פתוח" | "זכיה" | "הפסד")} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", gridColumn: "1 / -1" }}>
                {["פתוח", "זכיה", "הפסד"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select value={createAssignedRep} onChange={(e) => setCreateAssignedRep(e.target.value)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", gridColumn: "1 / -1" }}>
                <option value="">נציג משויך</option>
                {adminUsers.map((u) => (
                  <option key={u.email} value={u.email}>{u.email}</option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => void createContact()}
                disabled={savingCreate}
                style={{
                  padding: "9px 12px",
                  borderRadius: 10,
                  border: "none",
                  background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {savingCreate ? "שומר..." : "שמור"}
              </button>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {detailOpen && detail && (
        <div style={{ position: "fixed", inset: 0, zIndex: 95 }}>
          <div
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)" }}
            onMouseDown={() => setDetailOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(920px, 96vw)",
              maxHeight: "92vh",
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              boxShadow: "12px 0 30px rgba(0,0,0,0.08)",
              padding: 16,
              overflow: "auto",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>
                {detail.name || detail.email || detail.phone || detail.id}
              </h3>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                style={{ border: "1px solid #e5e7eb", background: "#fff", borderRadius: 10, padding: "6px 10px", cursor: "pointer" }}
              >
                סגור
              </button>
            </div>

            <div style={{ marginTop: 10, display: "inline-flex", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
              {(["details", "notes", "tasks"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDetailTab(t)}
                  style={{
                    border: "none",
                    background: detailTab === t ? "#ede9fe" : "#fff",
                    padding: "8px 10px",
                    cursor: "pointer",
                    fontWeight: 800,
                  }}
                >
                  {t === "details" ? "פרטים" : t === "notes" ? "פתקים" : "משימות"}
                </button>
              ))}
            </div>

            {detailTab === "details" && (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                <input value={detail.name ?? ""} onChange={(e) => setDetail((d) => (d ? { ...d, name: e.target.value } : d))} placeholder="שם" style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                <input value={detail.phone ?? ""} onChange={(e) => setDetail((d) => (d ? { ...d, phone: e.target.value } : d))} placeholder="טלפון" style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                <input value={detail.email ?? ""} onChange={(e) => setDetail((d) => (d ? { ...d, email: e.target.value } : d))} placeholder="אימייל" style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                <select value={detail.status ?? "פתוח"} onChange={(e) => setDetail((d) => (d ? { ...d, status: e.target.value as "פתוח" | "זכיה" | "הפסד" } : d))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                  {["פתוח", "זכיה", "הפסד"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <select value={detail.assignedRep ?? ""} onChange={(e) => setDetail((d) => (d ? { ...d, assignedRep: e.target.value } : d))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                  <option value="">Unassigned</option>
                  {adminUsers.map((u) => (
                    <option key={u.email} value={u.email}>{u.email}</option>
                  ))}
                </select>
                <input value={detail.stage ?? ""} onChange={(e) => setDetail((d) => (d ? { ...d, stage: e.target.value } : d))} placeholder="שלב" style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                <div style={{ border: "1px solid #f3f4f6", borderRadius: 10, padding: 8 }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>הזדמנויות פתוחות תחת איש קשר</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {detailOpportunities.length === 0 ? (
                      <span style={{ color: "#6b7280", fontSize: 12 }}>אין הזדמנויות פתוחות כרגע</span>
                    ) : (
                      detailOpportunities.map((o) => (
                        <span key={o.id} style={{ border: "1px solid #e5e7eb", borderRadius: 999, padding: "4px 8px", fontSize: 12, fontWeight: 700 }}>
                          {o.name} · {o.pipelineId} · {o.stage}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={savingDetail}
                  onClick={() =>
                    void saveDetail({
                      name: detail.name ?? "",
                      phone: detail.phone ?? "",
                      email: detail.email ?? "",
                      status: detail.status ?? "פתוח",
                      assignedRep: detail.assignedRep ?? "",
                      stage: detail.stage ?? "Pending",
                      customFields: detail.customFields ?? {},
                    })
                  }
                  style={{ padding: "9px 12px", borderRadius: 10, border: "none", background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)", color: "#fff", fontWeight: 800, cursor: "pointer" }}
                >
                  {savingDetail ? "שומר..." : "שמור שינויים"}
                </button>
              </div>
            )}

            {detailTab === "notes" && (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                {(detail.notes ?? []).map((n) => (
                  <textarea key={n.id} value={n.text} readOnly style={{ width: "100%", minHeight: 70, padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                ))}
                {(detailAggNotes ?? []).map((n) => (
                  <textarea key={`agg-${n.id}`} value={n.text} readOnly style={{ width: "100%", minHeight: 60, padding: "8px 10px", borderRadius: 10, border: "1px dashed #cbd5e1", background: "#f8fafc" }} />
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const text = window.prompt("טקסט לפתק");
                    if (!text?.trim()) return;
                    const notes = [...(detail.notes ?? []), { id: crypto.randomUUID(), text: text.trim(), createdAt: new Date().toISOString() }];
                    setDetail((d) => (d ? { ...d, notes } : d));
                    void saveDetail({ notes });
                  }}
                  style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
                >
                  + הוסף פתק
                </button>
              </div>
            )}

            {detailTab === "tasks" && (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                {(detail.tasks ?? []).map((t) => (
                  <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                    <input
                      type="checkbox"
                      checked={Boolean((t.status ?? (t.done ? "done" : "todo")) === "done")}
                      onChange={(e) => {
                        const tasks = (detail.tasks ?? []).map((x) =>
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
                        setDetail((d) => (d ? { ...d, tasks } : d));
                        void saveDetail({ tasks });
                      }}
                    />
                    <span style={{ fontWeight: 700 }}>{t.title}</span>
                    <span style={{ color: "#6b7280", fontSize: 12 }}>{t.dueAt}</span>
                  </label>
                ))}
                {(detailAggTasks ?? []).map((t) => (
                  <label key={`agg-${t.id}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, border: "1px dashed #cbd5e1", background: "#f8fafc" }}>
                    <input type="checkbox" checked={Boolean((t.status ?? (t.done ? "done" : "todo")) === "done")} readOnly />
                    <span style={{ fontWeight: 700 }}>{t.title}</span>
                    <span style={{ color: "#6b7280", fontSize: 12 }}>{t.dueAt}</span>
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const title = window.prompt("כותרת משימה");
                    if (!title?.trim()) return;
                    const dueAt = window.prompt("תאריך ושעה (YYYY-MM-DD HH:mm)", new Date().toISOString().slice(0, 16).replace("T", " ")) || "";
                    const tasks = [
                      ...(detail.tasks ?? []),
                      {
                        id: crypto.randomUUID(),
                        title: title.trim(),
                        dueAt: dueAt.trim(),
                        done: false,
                        status: "todo" as const,
                        comments: [] as Array<{ id: string; text: string; createdAt: string }>,
                        createdAt: new Date().toISOString(),
                      },
                    ];
                    setDetail((d) => (d ? { ...d, tasks } : d));
                    void saveDetail({ tasks });
                  }}
                  style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
                >
                  + הוסף משימה
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


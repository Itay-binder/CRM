"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";

type TabId = "settings" | "templates" | "campaigns";

type SettingsVm = {
  appId: string;
  businessAccountId: string;
  wabaId: string;
  phoneNumberId: string;
  hasToken: boolean;
  tokenPreview: string;
  updatedAt: string;
};

type TemplateVm = {
  id: string;
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language: string;
  bodyText: string;
  exampleValues: string[];
  status: "draft" | "submitted" | "approved" | "rejected";
  metaTemplateId?: string;
  metaStatus?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
};

type ContactRow = {
  id: string;
  name: string;
  phone: string;
  email: string;
};

type CampaignVm = {
  id: string;
  templateName: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdBy: string;
  createdAt: string;
};

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

export default function WhatsAppAutomationsClient() {
  const [activeTab, setActiveTab] = useState<TabId>("settings");
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [sendingCampaign, setSendingCampaign] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [settings, setSettings] = useState<SettingsVm | null>(null);
  const [templates, setTemplates] = useState<TemplateVm[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignVm[]>([]);

  const [appId, setAppId] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [systemUserToken, setSystemUserToken] = useState("");

  const [tplName, setTplName] = useState("");
  const [tplCategory, setTplCategory] = useState<"MARKETING" | "UTILITY" | "AUTHENTICATION">(
    "MARKETING"
  );
  const [tplLanguage, setTplLanguage] = useState("he");
  const [tplBodyText, setTplBodyText] = useState("");
  const [tplExampleValues, setTplExampleValues] = useState("");

  const [campaignTemplateId, setCampaignTemplateId] = useState("");
  const [campaignParams, setCampaignParams] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setOkMsg(null);
    try {
      const [settingsRes, templatesRes, contactsRes, campaignsRes] = await Promise.all([
        fetch("/api/whatsapp/settings", { credentials: "include", cache: "no-store" }),
        fetch("/api/whatsapp/templates", { credentials: "include", cache: "no-store" }),
        fetch("/api/contacts", { credentials: "include", cache: "no-store" }),
        fetch("/api/whatsapp/campaigns/send", { credentials: "include", cache: "no-store" }),
      ]);

      if (settingsRes.status === 401) {
        window.location.href = `/login?returnTo=${encodeURIComponent("/whatsapp-automations")}`;
        return;
      }
      if (settingsRes.status === 403) {
        setErr("אין הרשאה למסך ווצאפ. נדרש משתמש מנהל.");
        return;
      }

      const settingsJson = await parseJson<{ ok?: boolean; config?: SettingsVm; error?: string }>(
        settingsRes
      );
      const templatesJson = await parseJson<{ ok?: boolean; templates?: TemplateVm[]; error?: string }>(
        templatesRes
      );
      const contactsJson = await parseJson<{
        ok?: boolean;
        rows?: Record<string, string>[];
        error?: string;
      }>(contactsRes);
      const campaignsJson = await parseJson<{
        ok?: boolean;
        campaigns?: CampaignVm[];
        error?: string;
      }>(campaignsRes);

      if (!settingsJson.ok) throw new Error(settingsJson.error || "שגיאה בטעינת הגדרות Meta");
      if (!templatesJson.ok) throw new Error(templatesJson.error || "שגיאה בטעינת טמפלטים");
      if (!contactsJson.ok) throw new Error(contactsJson.error || "שגיאה בטעינת אנשי קשר");
      if (!campaignsJson.ok) throw new Error(campaignsJson.error || "שגיאה בטעינת קמפיינים");

      setSettings(settingsJson.config ?? null);
      if (settingsJson.config) {
        setAppId(settingsJson.config.appId ?? "");
        setBusinessAccountId(settingsJson.config.businessAccountId ?? "");
        setWabaId(settingsJson.config.wabaId ?? "");
        setPhoneNumberId(settingsJson.config.phoneNumberId ?? "");
      }
      const templatesLoaded = templatesJson.templates ?? [];
      setTemplates(templatesLoaded);
      setCampaignTemplateId((prev) => {
        if (prev) return prev;
        return templatesLoaded[0]?.id ?? "";
      });
      setCampaigns(campaignsJson.campaigns ?? []);
      setContacts(
        (contactsJson.rows ?? []).map((r) => ({
          id: String(r.id ?? ""),
          name: String(r.name ?? "").trim(),
          phone: String(r.phone ?? "").trim(),
          email: String(r.email ?? "").trim(),
        }))
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "טעינה נכשלה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      [c.name, c.phone, c.email, c.id].some((v) => v.toLowerCase().includes(q))
    );
  }, [contacts, contactSearch]);

  const selectedCount = selectedRecipientIds.length;
  const selectedTemplate = templates.find((t) => t.id === campaignTemplateId) ?? null;

  function toggleRecipient(id: string) {
    setSelectedRecipientIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function selectAllFiltered() {
    setSelectedRecipientIds((prev) => {
      const set = new Set(prev);
      for (const c of filteredContacts) {
        if (c.id) set.add(c.id);
      }
      return Array.from(set);
    });
  }

  function clearSelection() {
    setSelectedRecipientIds([]);
  }

  async function saveSettings() {
    setSavingSettings(true);
    setErr(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/whatsapp/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId,
          businessAccountId,
          wabaId,
          phoneNumberId,
          systemUserToken: systemUserToken.trim() || undefined,
        }),
      });
      const j = await parseJson<{ ok?: boolean; error?: string; config?: SettingsVm }>(res);
      if (!res.ok || !j.ok || !j.config) throw new Error(j.error || "שמירת הגדרות נכשלה");
      setSettings(j.config);
      setSystemUserToken("");
      setOkMsg("הגדרות Meta נשמרו.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שמירת הגדרות נכשלה");
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveTemplate() {
    setSavingTemplate(true);
    setErr(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/whatsapp/templates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tplName,
          category: tplCategory,
          language: tplLanguage,
          bodyText: tplBodyText,
          exampleValues: tplExampleValues
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        }),
      });
      const j = await parseJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "יצירת טמפלט נכשלה");
      setTplName("");
      setTplBodyText("");
      setTplExampleValues("");
      setOkMsg("הטמפלט נשמר כטיוטה.");
      await loadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "יצירת טמפלט נכשלה");
    } finally {
      setSavingTemplate(false);
    }
  }

  async function submitTemplate(templateId: string) {
    setErr(null);
    setOkMsg(null);
    try {
      const res = await fetch(`/api/whatsapp/templates/${encodeURIComponent(templateId)}/submit`, {
        method: "POST",
        credentials: "include",
      });
      const j = await parseJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "שליחה לאישור Meta נכשלה");
      setOkMsg("הטמפלט נשלח לאישור ב-Meta.");
      await loadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שליחה לאישור נכשלה");
    }
  }

  async function sendCampaign() {
    setSendingCampaign(true);
    setErr(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/whatsapp/campaigns/send", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: campaignTemplateId,
          recipientIds: selectedRecipientIds,
          parameterValues: campaignParams
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        }),
      });
      const j = await parseJson<{ ok?: boolean; error?: string; campaign?: CampaignVm }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "שליחת קמפיין נכשלה");
      setOkMsg("הקמפיין נשלח. בדקו תוצאות היסטוריה למטה.");
      setSelectedRecipientIds([]);
      await loadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שליחת קמפיין נכשלה");
    } finally {
      setSendingCampaign(false);
    }
  }

  return (
    <div style={{ maxWidth: 1180 }}>
      <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 900 }}>אוטומציות ווצאפ</h1>
      <p style={{ margin: "0 0 18px", color: "#4b5563", lineHeight: 1.55 }}>
        חיבור ל-Meta WhatsApp Business, יצירת טמפלטים, שליחה לאישור, וביצוע קמפיין לפי אנשי קשר מה-CRM.
      </p>

      <div style={{ display: "inline-flex", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
        {[
          { id: "settings" as const, label: "חיבור למטא" },
          { id: "templates" as const, label: "טמפלטים" },
          { id: "campaigns" as const, label: "שליחת אוטומציה" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            style={{
              border: "none",
              background: activeTab === t.id ? "#ede9fe" : "#fff",
              color: activeTab === t.id ? "#4c1d95" : "#111827",
              fontWeight: 800,
              padding: "10px 14px",
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {err ? (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b" }}>
          {err}
        </div>
      ) : null}
      {okMsg ? (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: "#ecfdf5", color: "#065f46" }}>
          {okMsg}
        </div>
      ) : null}

      {loading ? <div style={{ color: "#6b7280" }}>טוען…</div> : null}

      {!loading && activeTab === "settings" ? (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 800 }}>פרטי חיבור Meta / WhatsApp Business</div>
          <input
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            placeholder="Meta App ID"
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
          />
          <input
            value={businessAccountId}
            onChange={(e) => setBusinessAccountId(e.target.value)}
            placeholder="Meta Business Account ID (אופציונלי)"
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
          />
          <input
            value={wabaId}
            onChange={(e) => setWabaId(e.target.value)}
            placeholder="WhatsApp Business Account ID (WABA ID)"
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
          />
          <input
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="Phone Number ID"
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
          />
          <input
            value={systemUserToken}
            onChange={(e) => setSystemUserToken(e.target.value)}
            placeholder="System User Access Token (השאר ריק אם לא מחליפים)"
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
          />
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            טוקן שמור כרגע: {settings?.hasToken ? settings.tokenPreview : "לא הוגדר"}
            {settings?.updatedAt ? ` · עודכן ${formatIsraelDateTime(settings.updatedAt)}` : ""}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => void saveSettings()}
              disabled={savingSettings}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "none",
                background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
                color: "#fff",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {savingSettings ? "שומר..." : "שמור חיבור"}
            </button>
          </div>
        </div>
      ) : null}

      {!loading && activeTab === "templates" ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 800 }}>יצירת טמפלט חדש</div>
            <input
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              placeholder="שם טמפלט (רק lowercase_underscore מומלץ)"
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
            />
            <select
              value={tplCategory}
              onChange={(e) =>
                setTplCategory(e.target.value as "MARKETING" | "UTILITY" | "AUTHENTICATION")
              }
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
            >
              <option value="MARKETING">MARKETING</option>
              <option value="UTILITY">UTILITY</option>
              <option value="AUTHENTICATION">AUTHENTICATION</option>
            </select>
            <input
              value={tplLanguage}
              onChange={(e) => setTplLanguage(e.target.value)}
              placeholder="language code, לדוגמה he"
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
            />
            <textarea
              value={tplBodyText}
              onChange={(e) => setTplBodyText(e.target.value)}
              placeholder="תוכן הודעה (אפשר placeholders של Meta כמו {{1}} {{2}})"
              style={{
                minHeight: 100,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
            <input
              value={tplExampleValues}
              onChange={(e) => setTplExampleValues(e.target.value)}
              placeholder="ערכי דוגמה לפלייסהולדרים (מופרדים בפסיק), למשל ישראל,30%"
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
            />
            <button
              type="button"
              onClick={() => void saveTemplate()}
              disabled={savingTemplate}
              style={{
                justifySelf: "start",
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {savingTemplate ? "שומר..." : "שמור טיוטת טמפלט"}
            </button>
          </div>

          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>טמפלטים קיימים</div>
            {templates.length === 0 ? (
              <div style={{ color: "#6b7280" }}>אין טמפלטים עדיין.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {templates.map((t) => (
                  <div key={t.id} style={{ border: "1px solid #f3f4f6", borderRadius: 12, padding: 12 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <strong>{t.name}</strong>
                      <span style={{ fontSize: 12, color: "#6b7280" }}>
                        {t.category} · {t.language}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color:
                            t.status === "approved"
                              ? "#065f46"
                              : t.status === "rejected"
                                ? "#991b1b"
                                : "#6d28d9",
                        }}
                      >
                        {t.status.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ marginTop: 6, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{t.bodyText}</div>
                    <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                      דוגמה: {t.exampleValues.join(", ") || "—"}{" "}
                      {t.metaStatus ? `· Meta: ${t.metaStatus}` : ""}
                    </div>
                    {t.rejectionReason ? (
                      <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>
                        סיבת דחייה: {t.rejectionReason}
                      </div>
                    ) : null}
                    <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => void submitTemplate(t.id)}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid #ddd6fe",
                          background: "#faf5ff",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        שלח לאישור במטא
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {!loading && activeTab === "campaigns" ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 900 }}>שליחה אוטומטית מרשימת אנשי קשר</div>
            <select
              value={campaignTemplateId}
              onChange={(e) => setCampaignTemplateId(e.target.value)}
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
            >
              <option value="">בחר טמפלט...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.status})
                </option>
              ))}
            </select>
            <input
              value={campaignParams}
              onChange={(e) => setCampaignParams(e.target.value)}
              placeholder="ערכי פרמטרים לטמפלט (מופרדים בפסיק, לפי {{1}},{{2}})"
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
            />
            {selectedTemplate && selectedTemplate.status !== "approved" ? (
              <div style={{ fontSize: 12, color: "#b45309" }}>
                הטמפלט עדיין לא במצב approved. אפשר לנסות שליחה, אבל Meta עלולה לחסום.
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
              <input
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="חיפוש אנשי קשר (שם/טלפון/מייל)"
                style={{
                  flex: "1 1 260px",
                  minWidth: 220,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                }}
              />
              <button
                type="button"
                onClick={selectAllFiltered}
                style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
              >
                בחר הכל (מסונן)
              </button>
              <button
                type="button"
                onClick={clearSelection}
                style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
              >
                נקה בחירה
              </button>
              <span style={{ fontSize: 12, color: "#6b7280" }}>נבחרו: {selectedCount}</span>
            </div>

            <div style={{ maxHeight: 320, overflow: "auto", border: "1px solid #f3f4f6", borderRadius: 12, padding: 8 }}>
              {filteredContacts.map((c) => (
                <label key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 4px", borderBottom: "1px solid #fafafa" }}>
                  <input
                    type="checkbox"
                    checked={selectedRecipientIds.includes(c.id)}
                    onChange={() => toggleRecipient(c.id)}
                  />
                  <span style={{ fontWeight: 700 }}>{c.name || c.email || c.id}</span>
                  <span style={{ color: "#6b7280", fontSize: 12 }}>{c.phone || "ללא טלפון"}</span>
                </label>
              ))}
              {filteredContacts.length === 0 ? (
                <div style={{ color: "#6b7280", fontSize: 13 }}>אין תוצאות.</div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => void sendCampaign()}
              disabled={sendingCampaign || !campaignTemplateId || selectedRecipientIds.length === 0}
              style={{
                justifySelf: "start",
                padding: "10px 14px",
                borderRadius: 10,
                border: "none",
                background: "linear-gradient(180deg, #16a34a 0%, #15803d 100%)",
                color: "#fff",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {sendingCampaign ? "שולח..." : "שלח אוטומציית ווצאפ"}
            </button>
          </div>

          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>היסטוריית קמפיינים</div>
            {campaigns.length === 0 ? (
              <div style={{ color: "#6b7280" }}>עדיין לא נשלחו קמפיינים.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {campaigns.map((c) => (
                  <div key={c.id} style={{ border: "1px solid #f3f4f6", borderRadius: 12, padding: 10 }}>
                    <div style={{ fontWeight: 800 }}>{c.templateName}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      {formatIsraelDateTime(c.createdAt)} · נוצר ע"י {c.createdBy}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 13 }}>
                      נשלחו: {c.sentCount} · נכשלו: {c.failedCount} · סה"כ: {c.recipientCount}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

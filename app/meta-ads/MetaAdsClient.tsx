"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";

type SettingsVm = {
  appId: string;
  businessId: string;
  adAccountId: string;
  hasToken: boolean;
  tokenPreview: string;
  updatedAt: string;
  canManage: boolean;
};

type TokenStatus = {
  connected: boolean;
  scopes: string[];
  expiresAt: string;
  error: string | null;
};

type CampaignVm = {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  objective: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  cpc: number;
  ctr: number;
  dailyBudget: number;
  lifetimeBudget: number;
  startTime?: string;
  stopTime?: string;
  updatedTime?: string;
};

type CampaignsResponse = {
  ok?: boolean;
  adAccountId?: string;
  datePreset?: string;
  fetchedAt?: string;
  campaigns?: CampaignVm[];
  error?: string;
};

function money(v: number): string {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" }).format(v || 0);
}

function intFmt(v: number): string {
  return new Intl.NumberFormat("he-IL").format(v || 0);
}

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

function daysUntil(isoDate: string): number | null {
  if (!isoDate) return null;
  const ms = new Date(isoDate).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export default function MetaAdsClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [settings, setSettings] = useState<SettingsVm | null>(null);
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignVm[]>([]);
  const [fetchedAt, setFetchedAt] = useState("");

  const [adAccountId, setAdAccountId] = useState("");
  const [datePreset, setDatePreset] = useState("last_7d");
  const [search, setSearch] = useState("");

  // Advanced / manual token section
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [appId, setAppId] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [accessToken, setAccessToken] = useState("");

  // Handle OAuth redirect params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("meta_connected") === "1") {
      setOkMsg("Meta Ads חובר בהצלחה! טוקן נשמר ל-60 יום.");
      window.history.replaceState({}, "", "/meta-ads");
    }
    const metaError = params.get("meta_error");
    if (metaError) {
      setErr(decodeURIComponent(metaError));
      window.history.replaceState({}, "", "/meta-ads");
    }
  }, []);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/meta-ads/settings", {
      credentials: "include",
      cache: "no-store",
    });
    if (res.status === 401) {
      window.location.href = `/login?returnTo=${encodeURIComponent("/meta-ads")}`;
      return null;
    }
    const j = await parseJson<{ ok?: boolean; config?: SettingsVm; error?: string }>(res);
    if (!res.ok || !j.ok || !j.config) throw new Error(j.error || "טעינת הגדרות נכשלה");
    setSettings(j.config);
    setAdAccountId(j.config.adAccountId ?? "");
    setAppId(j.config.appId ?? "");
    setBusinessId(j.config.businessId ?? "");
    return j.config;
  }, []);

  const loadTokenStatus = useCallback(async () => {
    const res = await fetch("/api/meta-ads/status", {
      credentials: "include",
      cache: "no-store",
    });
    const j = await parseJson<{ ok?: boolean; connected?: boolean; scopes?: string[]; expiresAt?: string; error?: string | null }>(res);
    if (res.ok && j.ok) {
      setTokenStatus({
        connected: j.connected ?? false,
        scopes: j.scopes ?? [],
        expiresAt: j.expiresAt ?? "",
        error: j.error ?? null,
      });
    }
  }, []);

  const loadCampaigns = useCallback(async (preset: string) => {
    const res = await fetch(
      `/api/meta-ads/campaigns?datePreset=${encodeURIComponent(preset)}`,
      { credentials: "include", cache: "no-store" }
    );
    const j = await parseJson<CampaignsResponse>(res);
    if (!res.ok || !j.ok) {
      if (res.status === 400) {
        setCampaigns([]);
        setFetchedAt("");
        return;
      }
      throw new Error(j.error || "טעינת קמפיינים נכשלה");
    }
    setCampaigns(j.campaigns ?? []);
    setFetchedAt(j.fetchedAt ?? "");
  }, []);

  const loadAll = useCallback(
    async (preset: string) => {
      setLoading(true);
      setErr(null);
      try {
        const cfg = await loadSettings();
        await loadTokenStatus();
        if (cfg?.adAccountId && cfg.hasToken) {
          await loadCampaigns(preset);
        } else {
          setCampaigns([]);
          setFetchedAt("");
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "שגיאה");
      } finally {
        setLoading(false);
      }
    },
    [loadCampaigns, loadSettings, loadTokenStatus]
  );

  useEffect(() => {
    void loadAll(datePreset);
  }, [datePreset, loadAll]);

  async function saveSettings() {
    if (!settings?.canManage) return;
    setSaving(true);
    setErr(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/meta-ads/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId,
          businessId,
          adAccountId,
          accessToken: accessToken.trim() || undefined,
        }),
      });
      const j = await parseJson<{ ok?: boolean; config?: SettingsVm; error?: string }>(res);
      if (!res.ok || !j.ok || !j.config) throw new Error(j.error || "שמירת הגדרות נכשלה");
      setSettings(j.config);
      setAccessToken("");
      setOkMsg("הגדרות Meta Ads נשמרו.");
      await loadTokenStatus();
      await loadCampaigns(datePreset);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שמירת הגדרות נכשלה");
    } finally {
      setSaving(false);
    }
  }

  async function saveAdAccountOnly() {
    if (!settings?.canManage) return;
    setSaving(true);
    setErr(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/meta-ads/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adAccountId }),
      });
      const j = await parseJson<{ ok?: boolean; config?: SettingsVm; error?: string }>(res);
      if (!res.ok || !j.ok || !j.config) throw new Error(j.error || "שמירת Ad Account נכשלה");
      setSettings(j.config);
      setOkMsg("Ad Account ID נשמר.");
      if (j.config.hasToken) await loadCampaigns(datePreset);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!settings?.canManage) return;
    setDisconnecting(true);
    setErr(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/meta-ads/disconnect", {
        method: "POST",
        credentials: "include",
      });
      const j = await parseJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "ניתוק נכשל");
      setOkMsg("Meta Ads נותק.");
      setTokenStatus({ connected: false, scopes: [], expiresAt: "", error: null });
      setCampaigns([]);
      setFetchedAt("");
      const updatedSettings = await loadSettings();
      if (updatedSettings) setSettings(updatedSettings);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ניתוק נכשל");
    } finally {
      setDisconnecting(false);
    }
  }

  async function refreshCampaigns() {
    setRefreshing(true);
    setErr(null);
    try {
      await loadCampaigns(datePreset);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "רענון נכשל");
    } finally {
      setRefreshing(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return campaigns;
    return campaigns.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.status.toLowerCase().includes(q) ||
        c.effectiveStatus.toLowerCase().includes(q)
    );
  }, [campaigns, search]);

  const daysLeft = tokenStatus?.expiresAt ? daysUntil(tokenStatus.expiresAt) : null;
  const tokenWarning = daysLeft !== null && daysLeft <= 14;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.6, fontSize: 14 }}>
        כאן מחברים את חשבון ה־Meta Ads Manager ומקבלים נתוני קמפיינים פעילים (תקציב, הוצאה,
        חשיפות, קליקים ו־CTR) ישירות ב־CRM.
      </p>

      {err ? (
        <div style={{ padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b" }}>
          {err}
        </div>
      ) : null}
      {okMsg ? (
        <div style={{ padding: 12, borderRadius: 10, background: "#ecfdf5", color: "#065f46" }}>
          {okMsg}
        </div>
      ) : null}

      {/* ── Connection card ── */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 16,
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 16 }}>חיבור Meta Ads Manager</div>

        {/* Token status */}
        {!loading && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderRadius: 10,
              background: tokenStatus?.connected
                ? tokenWarning
                  ? "#fffbeb"
                  : "#ecfdf5"
                : "#f9fafb",
              border: `1px solid ${
                tokenStatus?.connected ? (tokenWarning ? "#fcd34d" : "#6ee7b7") : "#e5e7eb"
              }`,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: tokenStatus?.connected
                  ? tokenWarning
                    ? "#f59e0b"
                    : "#10b981"
                  : "#d1d5db",
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, fontSize: 13 }}>
              {tokenStatus?.connected ? (
                <>
                  <strong>מחובר</strong>
                  {tokenStatus.expiresAt && (
                    <span style={{ color: tokenWarning ? "#92400e" : "#6b7280" }}>
                      {" "}
                      · פג תוקף{" "}
                      {daysLeft !== null && daysLeft > 0
                        ? `בעוד ${daysLeft} ימים (${formatIsraelDateTime(tokenStatus.expiresAt)})`
                        : daysLeft === 0
                          ? "היום!"
                          : "פג תוקף"}
                    </span>
                  )}
                  {tokenStatus.scopes.length > 0 && (
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }} dir="ltr">
                      {tokenStatus.scopes.join(" · ")}
                    </div>
                  )}
                </>
              ) : (
                <span style={{ color: "#6b7280" }}>
                  {tokenStatus?.error ? `שגיאה: ${tokenStatus.error}` : "לא מחובר"}
                </span>
              )}
            </div>
            {settings?.canManage && tokenStatus?.connected && (
              <button
                type="button"
                onClick={() => void disconnect()}
                disabled={disconnecting}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "1px solid #fca5a5",
                  background: "#fff",
                  color: "#dc2626",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {disconnecting ? "מנתק..." : "נתק"}
              </button>
            )}
          </div>
        )}

        {/* OAuth connect button */}
        {settings?.canManage && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <a
              href="/api/meta-ads/connect"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "11px 20px",
                borderRadius: 10,
                background: "#1877f2",
                color: "#fff",
                fontWeight: 800,
                fontSize: 15,
                textDecoration: "none",
                alignSelf: "start",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              {tokenStatus?.connected ? "חבר מחדש עם Meta" : "התחבר עם Meta"}
            </a>
            <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
              הרשאות: ads_read · ads_management · business_management · טוקן תקף 60 יום
            </p>
          </div>
        )}
        {!settings?.canManage && !loading && (
          <div style={{ fontSize: 12, color: "#92400e" }}>רק מנהל יכול לעדכן את פרטי החיבור.</div>
        )}

        {/* Ad Account ID */}
        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ fontWeight: 700, fontSize: 14 }}>
            Ad Account ID <span style={{ color: "#dc2626" }}>*</span>
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={adAccountId}
              onChange={(e) => setAdAccountId(e.target.value)}
              placeholder="מספר החשבון (עם act_ או בלי)"
              dir="ltr"
              disabled={loading || !settings?.canManage}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                fontSize: 14,
              }}
            />
            {settings?.canManage && (
              <button
                type="button"
                onClick={() => void saveAdAccountOnly()}
                disabled={saving || loading || !adAccountId.trim()}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "none",
                  background: "#1d4ed8",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {saving ? "שומר..." : "שמור"}
              </button>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
            מופיע ב-Meta Business Manager תחת Ad Accounts — בפורמט{" "}
            <span dir="ltr">act_XXXXXXXXXX</span>
          </p>
        </div>

        {/* Advanced: manual token */}
        {settings?.canManage && (
          <details open={showAdvanced} onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}>
            <summary
              style={{
                cursor: "pointer",
                fontSize: 13,
                color: "#6b7280",
                fontWeight: 600,
                userSelect: "none",
              }}
            >
              הגדרות מתקדמות — System User Token ידני
            </summary>
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              <p style={{ margin: 0, fontSize: 12, color: "#92400e" }}>
                לשימוש עם System User Token שאינו פג תוקף (נוצר ב-Business Manager → System Users).
                ממלא אוטומטית לאחר חיבור OAuth — אפשר לדרוס ידנית אם צריך.
              </p>
              <input
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                placeholder="Meta App ID (אופציונלי)"
                dir="ltr"
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
              <input
                value={businessId}
                onChange={(e) => setBusinessId(e.target.value)}
                placeholder="Meta Business ID (אופציונלי)"
                dir="ltr"
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
              <input
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="Access Token ידני (ads_read)"
                dir="ltr"
                type="password"
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
              {settings?.hasToken && (
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  טוקן שמור: {settings.tokenPreview}
                  {settings.updatedAt
                    ? ` · עודכן ${formatIsraelDateTime(settings.updatedAt)}`
                    : ""}
                </div>
              )}
              <button
                type="button"
                onClick={() => void saveSettings()}
                disabled={saving}
                style={{
                  justifySelf: "start",
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: "none",
                  background: "#374151",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {saving ? "שומר..." : "שמור הגדרות מתקדמות"}
              </button>
            </div>
          </details>
        )}
      </div>

      {/* ── Campaigns table ── */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 16 }}>קמפיינים פעילים</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
            >
              <option value="today">היום</option>
              <option value="yesterday">אתמול</option>
              <option value="last_7d">7 ימים</option>
              <option value="last_30d">30 ימים</option>
              <option value="this_month">החודש</option>
              <option value="last_month">חודש קודם</option>
              <option value="maximum">מקסימום</option>
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לפי שם/ID"
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
            />
            <button
              type="button"
              onClick={() => void refreshCampaigns()}
              disabled={refreshing || loading}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                background: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {refreshing ? "מרענן..." : "רענן"}
            </button>
          </div>
        </div>
        <div style={{ marginBottom: 8, fontSize: 12, color: "#6b7280" }}>
          {fetchedAt
            ? `עודכן לאחרונה: ${formatIsraelDateTime(fetchedAt)}`
            : "אין סנכרון נתונים עדיין."}
        </div>

        {loading ? (
          <div style={{ color: "#6b7280" }}>טוען...</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: "#6b7280" }}>
            אין קמפיינים פעילים להצגה. בדוק חיבור/הרשאות או שנה טווח זמן.
          </div>
        ) : (
          <div style={{ overflow: "auto" }}>
            <table style={{ width: "100%", minWidth: 1080, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {[
                    "קמפיין",
                    "סטטוס",
                    "מטרה",
                    "הוצאה",
                    "חשיפות",
                    "Reach",
                    "קליקים",
                    "CTR",
                    "CPC",
                    "תקציב יומי",
                    "תקציב כולל",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "right",
                        padding: "10px 12px",
                        borderBottom: "2px solid #e5e7eb",
                        background: "#f8fafc",
                        fontSize: 12,
                        fontWeight: 900,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ fontWeight: 800 }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: "#6b7280" }} dir="ltr">
                        {c.id}
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div>{c.status}</div>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>{c.effectiveStatus}</div>
                    </td>
                    <td style={{ padding: "10px 12px" }}>{c.objective || "—"}</td>
                    <td style={{ padding: "10px 12px" }}>{money(c.spend)}</td>
                    <td style={{ padding: "10px 12px" }}>{intFmt(c.impressions)}</td>
                    <td style={{ padding: "10px 12px" }}>{intFmt(c.reach)}</td>
                    <td style={{ padding: "10px 12px" }}>{intFmt(c.clicks)}</td>
                    <td style={{ padding: "10px 12px" }}>
                      {c.ctr ? `${c.ctr.toFixed(2)}%` : "0%"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>{money(c.cpc)}</td>
                    <td style={{ padding: "10px 12px" }}>
                      {c.dailyBudget ? money(c.dailyBudget) : "—"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {c.lifetimeBudget ? money(c.lifetimeBudget) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

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

export default function MetaAdsClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [settings, setSettings] = useState<SettingsVm | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignVm[]>([]);
  const [fetchedAt, setFetchedAt] = useState("");

  const [appId, setAppId] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [adAccountId, setAdAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [datePreset, setDatePreset] = useState("last_7d");
  const [search, setSearch] = useState("");

  const loadSettings = useCallback(async () => {
    const settingsRes = await fetch("/api/meta-ads/settings", {
      credentials: "include",
      cache: "no-store",
    });
    if (settingsRes.status === 401) {
      window.location.href = `/login?returnTo=${encodeURIComponent("/meta-ads")}`;
      return null;
    }
    const settingsJson = await parseJson<{ ok?: boolean; config?: SettingsVm; error?: string }>(
      settingsRes
    );
    if (!settingsRes.ok || !settingsJson.ok || !settingsJson.config) {
      throw new Error(settingsJson.error || "טעינת הגדרות Meta Ads נכשלה");
    }
    setSettings(settingsJson.config);
    setAppId(settingsJson.config.appId ?? "");
    setBusinessId(settingsJson.config.businessId ?? "");
    setAdAccountId(settingsJson.config.adAccountId ?? "");
    return settingsJson.config;
  }, []);

  const loadCampaigns = useCallback(async (preset: string) => {
    const campaignsRes = await fetch(
      `/api/meta-ads/campaigns?datePreset=${encodeURIComponent(preset)}`,
      { credentials: "include", cache: "no-store" }
    );
    const campaignsJson = await parseJson<CampaignsResponse>(campaignsRes);
    if (!campaignsRes.ok || !campaignsJson.ok) {
      if (campaignsRes.status === 400) {
        setCampaigns([]);
        setFetchedAt("");
        return;
      }
      throw new Error(campaignsJson.error || "טעינת קמפיינים נכשלה");
    }
    setCampaigns(campaignsJson.campaigns ?? []);
    setFetchedAt(campaignsJson.fetchedAt ?? "");
  }, []);

  const loadAll = useCallback(
    async (preset: string) => {
      setLoading(true);
      setErr(null);
      try {
        const cfg = await loadSettings();
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
    [loadCampaigns, loadSettings]
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
      await loadCampaigns(datePreset);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שמירת הגדרות נכשלה");
    } finally {
      setSaving(false);
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

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.6, fontSize: 14 }}>
        כאן מחברים את חשבון ה־Meta Ads Manager ומקבלים נתונים לקמפיינים פעילים (תקציב, הוצאה, חשיפות,
        קליקים ו־CTR) ישירות בתוך ה־CRM.
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

      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 16,
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 16 }}>חיבור Meta Ads Manager</div>
        <input
          value={appId}
          onChange={(e) => setAppId(e.target.value)}
          placeholder="Meta App ID (אופציונלי)"
          dir="ltr"
          disabled={loading || !settings?.canManage}
          style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
        />
        <input
          value={businessId}
          onChange={(e) => setBusinessId(e.target.value)}
          placeholder="Meta Business ID (אופציונלי)"
          dir="ltr"
          disabled={loading || !settings?.canManage}
          style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
        />
        <input
          value={adAccountId}
          onChange={(e) => setAdAccountId(e.target.value)}
          placeholder="Ad Account ID (עם או בלי act_)"
          dir="ltr"
          disabled={loading || !settings?.canManage}
          style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
        />
        <input
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          placeholder="System User Access Token (ads_read)"
          dir="ltr"
          disabled={loading || !settings?.canManage}
          style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
        />
        <div style={{ fontSize: 13, color: "#6b7280" }}>
          טוקן שמור: {settings?.hasToken ? settings.tokenPreview : "לא הוגדר"}
          {settings?.updatedAt ? ` · עודכן ${formatIsraelDateTime(settings.updatedAt)}` : ""}
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "#92400e", lineHeight: 1.5 }}>
          נדרש טוקן עם הרשאת `ads_read` לפחות כדי לקרוא קמפיינים פעילים ונתוני ביצועים. בלי טוקן פעיל לא
          יוצגו נתונים.
        </p>
        {settings?.canManage ? (
          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={saving}
            style={{
              justifySelf: "start",
              padding: "10px 18px",
              borderRadius: 10,
              border: "none",
              background: "#1d4ed8",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {saving ? "שומר..." : "שמור חיבור"}
          </button>
        ) : (
          <div style={{ fontSize: 12, color: "#92400e" }}>רק מנהל יכול לעדכן את פרטי החיבור.</div>
        )}
      </div>

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
          {fetchedAt ? `עודכן לאחרונה: ${formatIsraelDateTime(fetchedAt)}` : "אין סנכרון נתונים עדיין."}
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
                    <td style={{ padding: "10px 12px" }}>{c.ctr ? `${c.ctr.toFixed(2)}%` : "0%"}</td>
                    <td style={{ padding: "10px 12px" }}>{money(c.cpc)}</td>
                    <td style={{ padding: "10px 12px" }}>{c.dailyBudget ? money(c.dailyBudget) : "—"}</td>
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

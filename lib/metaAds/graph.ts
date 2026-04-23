import type { MetaAdsConfig } from "@/lib/metaAds/repo";
import { normalizeAdAccountId } from "@/lib/metaAds/repo";

export type MetaTokenStatus = {
  valid: boolean;
  scopes: string[];
  expiresAt?: string;
  error?: string;
};

type MetaGraphError = {
  message?: string;
  error_user_title?: string;
  error_user_msg?: string;
};

type MetaCampaignInsight = {
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  cpc?: string;
  ctr?: string;
};

type MetaCampaignNode = {
  id?: string;
  name?: string;
  status?: string;
  effective_status?: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
  updated_time?: string;
  insights?: { data?: MetaCampaignInsight[] };
};

type MetaCampaignsResponse = {
  data?: MetaCampaignNode[];
  error?: MetaGraphError;
};

export type MetaAdsCampaignVm = {
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

function graphBaseUrl(): string {
  return process.env.META_GRAPH_API_BASE?.trim() || "https://graph.facebook.com/v22.0";
}

function toNum(raw?: string): number {
  const n = Number.parseFloat((raw ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

function toInt(raw?: string): number {
  const n = Number.parseInt((raw ?? "").trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

function budgetToCurrency(raw?: string): number {
  const cents = toNum(raw);
  return cents > 0 ? cents / 100 : 0;
}

async function callMetaGraph<T>(
  config: MetaAdsConfig,
  path: string,
  query: URLSearchParams
): Promise<T> {
  const base = graphBaseUrl().replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  query.set("access_token", config.accessToken);
  const res = await fetch(`${base}${normalizedPath}?${query.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: MetaGraphError };
  if (!res.ok) {
    const msg =
      json.error?.error_user_msg?.trim() ||
      json.error?.error_user_title?.trim() ||
      json.error?.message?.trim() ||
      `Meta Graph request failed (${res.status})`;
    throw new Error(msg);
  }
  return json;
}

export async function validateMetaToken(config: MetaAdsConfig): Promise<MetaTokenStatus> {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    return { valid: false, scopes: [], error: "META_APP_ID / META_APP_SECRET לא מוגדרים." };
  }
  if (!config.accessToken.trim()) {
    return { valid: false, scopes: [], error: "אין Access Token." };
  }
  try {
    const base = graphBaseUrl().replace(/\/$/, "");
    const res = await fetch(
      `${base}/debug_token?` +
        new URLSearchParams({
          input_token: config.accessToken,
          access_token: `${appId}|${appSecret}`,
        }).toString(),
      { cache: "no-store" }
    );
    const json = (await res.json().catch(() => ({}))) as {
      data?: { is_valid?: boolean; scopes?: string[]; expires_at?: number; error?: { message?: string } };
    };
    const data = json.data;
    if (!data?.is_valid) {
      return { valid: false, scopes: [], error: data?.error?.message ?? "Token אינו תקף." };
    }
    const expiresAt = data.expires_at ? new Date(data.expires_at * 1000).toISOString() : undefined;
    return { valid: true, scopes: Array.isArray(data.scopes) ? data.scopes : [], expiresAt };
  } catch (e) {
    return { valid: false, scopes: [], error: e instanceof Error ? e.message : "Validation failed" };
  }
}

export async function listActiveMetaAdsCampaigns(
  config: MetaAdsConfig,
  datePreset = "last_7d"
): Promise<MetaAdsCampaignVm[]> {
  const adAccountId = normalizeAdAccountId(config.adAccountId);
  if (!adAccountId.trim()) throw new Error("חסר Ad Account ID.");
  if (!config.accessToken.trim()) throw new Error("חסר Access Token.");

  const fields =
    "id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time,updated_time,insights.date_preset(" +
    datePreset +
    "){spend,impressions,reach,clicks,cpc,ctr}";
  const query = new URLSearchParams({
    fields,
    limit: "100",
    effective_status: JSON.stringify(["ACTIVE", "PAUSED", "PENDING_REVIEW", "IN_PROCESS"]),
  });

  const json = await callMetaGraph<MetaCampaignsResponse>(
    config,
    `/act_${adAccountId}/campaigns`,
    query
  );
  const rows = Array.isArray(json.data) ? json.data : [];
  const out: MetaAdsCampaignVm[] = [];
  for (const row of rows) {
    const id = (row.id ?? "").trim();
    if (!id) continue;
    const insight = row.insights?.data?.[0];
    out.push({
      id,
      name: (row.name ?? "").trim() || "ללא שם",
      status: (row.status ?? "").trim() || "UNKNOWN",
      effectiveStatus: (row.effective_status ?? "").trim() || "UNKNOWN",
      objective: (row.objective ?? "").trim() || "",
      spend: toNum(insight?.spend),
      impressions: toInt(insight?.impressions),
      reach: toInt(insight?.reach),
      clicks: toInt(insight?.clicks),
      cpc: toNum(insight?.cpc),
      ctr: toNum(insight?.ctr),
      dailyBudget: budgetToCurrency(row.daily_budget),
      lifetimeBudget: budgetToCurrency(row.lifetime_budget),
      startTime: row.start_time?.trim() || undefined,
      stopTime: row.stop_time?.trim() || undefined,
      updatedTime: row.updated_time?.trim() || undefined,
    });
  }
  return out.sort((a, b) => b.spend - a.spend || b.impressions - a.impressions);
}

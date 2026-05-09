"use client";

import { useState } from "react";
import type { MoverProfile, MoverService } from "@/movers-profile/types";
import { SERVICE_LABELS } from "@/movers-profile/types";

const ALL_SERVICES: MoverService[] = ["apartment", "small", "office", "loading"];

type Props = {
  initialProfiles: MoverProfile[];
};

type CreateForm = {
  name: string;
  phone: string;
  slug: string;
  bio: string;
  coverArea: string;
  services: MoverService[];
};

export default function MoverProfilesClient({ initialProfiles }: Props) {
  const [profiles, setProfiles] = useState<MoverProfile[]>(initialProfiles);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateForm>({
    name: "",
    phone: "",
    slug: "",
    bio: "",
    coverArea: "פעיל בכל הארץ",
    services: [],
  });

  function autoSlug(name: string) {
    return name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9֐-׿-]/g, "")
      .slice(0, 40);
  }

  async function createProfile() {
    if (!form.name.trim() || !form.phone.trim() || !form.slug.trim()) {
      setCreateError("שם, טלפון וסלאג הם שדות חובה");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/mover-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setCreateError(data.error ?? "שגיאה ביצירה");
        return;
      }
      setProfiles((prev) => [data.profile, ...prev]);
      setShowCreate(false);
      setForm({ name: "", phone: "", slug: "", bio: "", coverArea: "פעיל בכל הארץ", services: [] });
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(profile: MoverProfile) {
    setTogglingId(profile.id);
    try {
      const res = await fetch(`/api/mover-profiles/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !profile.isActive }),
      });
      if (res.ok) {
        setProfiles((prev) =>
          prev.map((p) =>
            p.id === profile.id ? { ...p, isActive: !profile.isActive } : p
          )
        );
      }
    } finally {
      setTogglingId(null);
    }
  }

  function toggleFormService(svc: MoverService) {
    setForm((f) => ({
      ...f,
      services: f.services.includes(svc)
        ? f.services.filter((s) => s !== svc)
        : [...f.services, svc],
    }));
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ fontWeight: 800, fontSize: 22, margin: 0 }}>פרופילי מובילים</h1>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 14 }}>
            {profiles.length} מובילים רשומים
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            padding: "10px 18px",
            borderRadius: 10,
            border: "none",
            background: "#7c3aed",
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          + צור פרופיל מוביל
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 24,
            marginBottom: 24,
            boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 18 }}>
            יצירת פרופיל מוביל חדש
          </div>
          {createError && (
            <div
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 8,
                padding: "10px 14px",
                color: "#b91c1c",
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {createError}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>שם המוביל *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((f) => ({ ...f, name, slug: f.slug || autoSlug(name) }));
                }}
                style={formInputStyle}
                placeholder="דוד לוי"
              />
            </div>
            <div>
              <label style={labelStyle}>טלפון *</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                style={formInputStyle}
                placeholder="0501234567"
              />
            </div>
            <div>
              <label style={labelStyle}>סלאג (URL) *</label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                style={formInputStyle}
                placeholder="david-levi"
                dir="ltr"
              />
              {form.slug && (
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                  /movers/{form.slug}
                </div>
              )}
            </div>
            <div>
              <label style={labelStyle}>אזור פעילות</label>
              <input
                type="text"
                value={form.coverArea}
                onChange={(e) => setForm((f) => ({ ...f, coverArea: e.target.value }))}
                style={formInputStyle}
              />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>ביו / תיאור</label>
            <textarea
              value={form.bio}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              rows={2}
              style={{ ...formInputStyle, resize: "vertical" as const }}
            />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>שירותים</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ALL_SERVICES.map((svc) => (
                <button
                  key={svc}
                  type="button"
                  onClick={() => toggleFormService(svc)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: `1px solid ${form.services.includes(svc) ? "#7c3aed" : "#e5e7eb"}`,
                    background: form.services.includes(svc) ? "#ede9fe" : "#fff",
                    color: form.services.includes(svc) ? "#5b21b6" : "#374151",
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {SERVICE_LABELS[svc]}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={createProfile}
              disabled={creating}
              style={{
                padding: "10px 24px",
                borderRadius: 10,
                border: "none",
                background: "#7c3aed",
                color: "#fff",
                fontWeight: 700,
                fontSize: 14,
                cursor: creating ? "not-allowed" : "pointer",
                opacity: creating ? 0.7 : 1,
                fontFamily: "inherit",
              }}
            >
              {creating ? "יוצר…" : "צור פרופיל"}
            </button>
            <button
              onClick={() => { setShowCreate(false); setCreateError(""); }}
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
                color: "#374151",
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      {/* Profiles list */}
      {profiles.length === 0 ? (
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 40,
            textAlign: "center",
            color: "#9ca3af",
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>🚚</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>אין מובילים עדיין</div>
          <div style={{ fontSize: 14 }}>לחץ "צור פרופיל מוביל" כדי להתחיל</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {profiles.map((profile) => (
            <div
              key={profile.id}
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: "#ede9fe",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  flexShrink: 0,
                  overflow: "hidden",
                }}
              >
                {profile.profileImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.profileImageUrl}
                    alt={profile.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  "👤"
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{profile.name}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  <span dir="ltr">/movers/{profile.slug}</span>
                  {" · "}
                  {profile.phone}
                </div>
                {profile.reviewCount > 0 && (
                  <div style={{ fontSize: 12, color: "#f59e0b", marginTop: 2 }}>
                    ★ {profile.rating.toFixed(1)} ({profile.reviewCount} דירוגים)
                  </div>
                )}
              </div>

              {/* Status badge */}
              <div
                style={{
                  padding: "4px 10px",
                  borderRadius: 20,
                  background: profile.isActive ? "#d1fae5" : "#fee2e2",
                  color: profile.isActive ? "#065f46" : "#991b1b",
                  fontSize: 12,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {profile.isActive ? "פעיל" : "לא פעיל"}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <a
                  href={`/movers/${profile.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    background: "#f9fafb",
                    color: "#374151",
                    fontSize: 12,
                    textDecoration: "none",
                    fontWeight: 500,
                  }}
                >
                  צפה
                </a>
                <a
                  href={`/movers/${profile.slug}/manage`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid #ddd6fe",
                    background: "#ede9fe",
                    color: "#5b21b6",
                    fontSize: 12,
                    textDecoration: "none",
                    fontWeight: 500,
                  }}
                >
                  ניהול
                </a>
                <button
                  onClick={() => toggleActive(profile)}
                  disabled={togglingId === profile.id}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: `1px solid ${profile.isActive ? "#fecaca" : "#bbf7d0"}`,
                    background: profile.isActive ? "#fef2f2" : "#f0fdf4",
                    color: profile.isActive ? "#991b1b" : "#065f46",
                    fontSize: 12,
                    cursor: togglingId === profile.id ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    fontWeight: 500,
                    opacity: togglingId === profile.id ? 0.6 : 1,
                  }}
                >
                  {profile.isActive ? "השבת" : "הפעל"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#374151",
  marginBottom: 5,
};

const formInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: "#fff",
  color: "#111827",
  fontSize: 14,
  outline: "none",
  fontFamily: "inherit",
};
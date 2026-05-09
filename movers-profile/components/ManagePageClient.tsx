"use client";

import { useState } from "react";
import StarRating from "./StarRating";
import type { PublicMoverData, MoverReview, MoverPhoto, MoverService } from "../types";
import { SERVICE_LABELS, SERVICE_ICONS } from "../types";

const ALL_SERVICES: MoverService[] = ["apartment", "small", "office", "loading"];

type Props = {
  data: PublicMoverData;
};

type Tab = "profile" | "reviews" | "photos";

export default function ManagePageClient({ data: initial }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [profile, setProfile] = useState(initial);
  const [reviews, setReviews] = useState<MoverReview[]>(initial.reviews);
  const [photos, setPhotos] = useState<MoverPhoto[]>(initial.photos);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [profileImageUploading, setProfileImageUploading] = useState(false);

  // Editable profile fields
  const [name, setName] = useState(initial.name);
  const [bio, setBio] = useState(initial.bio);
  const [coverArea, setCoverArea] = useState(initial.coverArea);
  const [services, setServices] = useState<MoverService[]>(initial.services);
  const [profileImageUrl, setProfileImageUrl] = useState(initial.profileImageUrl);

  async function saveProfile() {
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch(`/api/movers/${profile.slug}/manage/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, bio, coverArea, services, profileImageUrl }),
      });
      if (res.ok) {
        setProfile((p) => ({ ...p, name, bio, coverArea, services, profileImageUrl }));
        setSaveMsg("נשמר בהצלחה ✓");
        setTimeout(() => setSaveMsg(""), 3000);
      } else {
        setSaveMsg("שגיאה בשמירה");
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleReview(reviewId: string, isHidden: boolean) {
    const res = await fetch(
      `/api/movers/${profile.slug}/manage/reviews/${reviewId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isHidden }),
      }
    );
    if (res.ok) {
      setReviews((prev) =>
        prev.map((r) => (r.id === reviewId ? { ...r, isHidden } : r))
      );
    }
  }

  async function togglePhoto(photoId: string, isHidden: boolean) {
    const res = await fetch(
      `/api/movers/${profile.slug}/manage/photos/${photoId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isHidden }),
      }
    );
    if (res.ok) {
      setPhotos((prev) =>
        prev.map((p) => (p.id === photoId ? { ...p, isHidden } : p))
      );
    }
  }

  async function uploadPhoto(file: File) {
    setPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/movers/${profile.slug}/photos`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.photo) setPhotos((prev) => [json.photo, ...prev]);
    } finally {
      setPhotoUploading(false);
    }
  }

  async function uploadProfileImage(file: File) {
    setProfileImageUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/movers/${profile.slug}/manage/profile-image`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) return;
      const { imageUrl } = await res.json();
      if (imageUrl) setProfileImageUrl(imageUrl);
    } finally {
      setProfileImageUploading(false);
    }
  }

  function toggleService(svc: MoverService) {
    setServices((prev) =>
      prev.includes(svc) ? prev.filter((s) => s !== svc) : [...prev, svc]
    );
  }

  const profileUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/movers/${profile.slug}`
      : `/movers/${profile.slug}`;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0d0d1a 0%, #130d2b 100%)",
        fontFamily: "var(--font-rubik), Rubik, sans-serif",
        direction: "rtl",
        color: "#f9fafb",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 20px",
          borderBottom: "1px solid rgba(139,92,246,0.2)",
          background: "rgba(0,0,0,0.3)",
        }}
      >
        <div>
          <div style={{ fontWeight: 900, fontSize: 16, color: "#f9fafb" }}>
            ניהול פרופיל — {profile.name}
          </div>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>מאחורי הקלעים</div>
        </div>
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            border: "1px solid rgba(139,92,246,0.4)",
            background: "rgba(124,58,237,0.15)",
            color: "#c4b5fd",
            fontSize: 12,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          צפה בפרופיל ↗
        </a>
      </div>

      {/* Profile URL */}
      <div
        style={{
          margin: "16px 16px 0",
          background: "rgba(124,58,237,0.1)",
          border: "1px solid rgba(124,58,237,0.25)",
          borderRadius: 12,
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 12, color: "#9ca3af" }}>לינק הפרופיל שלך:</span>
        <span style={{ fontSize: 12, color: "#c4b5fd", flex: 1, direction: "ltr" }}>
          {profileUrl}
        </span>
        <button
          onClick={() => navigator.clipboard.writeText(profileUrl)}
          style={{
            background: "none",
            border: "none",
            color: "#a78bfa",
            cursor: "pointer",
            fontSize: 13,
            fontFamily: "inherit",
          }}
        >
          העתק
        </button>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 0,
          margin: "16px 16px 0",
          background: "rgba(255,255,255,0.05)",
          borderRadius: 12,
          padding: 4,
        }}
      >
        {(["profile", "reviews", "photos"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: 10,
              border: "none",
              background: activeTab === tab ? "rgba(124,58,237,0.6)" : "transparent",
              color: activeTab === tab ? "#f9fafb" : "#9ca3af",
              fontSize: 13,
              fontWeight: activeTab === tab ? 700 : 400,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.2s",
            }}
          >
            {tab === "profile" ? "פרופיל" : tab === "reviews" ? `המלצות (${reviews.length})` : `תמונות (${photos.length})`}
          </button>
        ))}
      </div>

      <div style={{ padding: "16px" }}>
        {/* Profile tab */}
        {activeTab === "profile" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <FieldBlock label="שם">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
              />
            </FieldBlock>

            <FieldBlock label="ביו / תיאור">
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                style={{ ...inputStyle, resize: "vertical" as const }}
              />
            </FieldBlock>

            <FieldBlock label="אזור פעילות">
              <input
                type="text"
                value={coverArea}
                onChange={(e) => setCoverArea(e.target.value)}
                style={inputStyle}
              />
            </FieldBlock>

            <FieldBlock label="תמונת פרופיל">
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.07)",
                    border: "2px solid rgba(139,92,246,0.35)",
                    overflow: "hidden",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {profileImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profileImageUrl}
                      alt="תמונת פרופיל"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span style={{ fontSize: 28 }}>👤</span>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <label
                    style={{
                      display: "inline-block",
                      padding: "10px 18px",
                      borderRadius: 10,
                      border: "1px solid rgba(139,92,246,0.4)",
                      background: profileImageUploading
                        ? "rgba(124,58,237,0.08)"
                        : "rgba(124,58,237,0.15)",
                      color: profileImageUploading ? "#9ca3af" : "#c4b5fd",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: profileImageUploading ? "not-allowed" : "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {profileImageUploading ? "מעלה תמונה…" : "בחר תמונה"}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      disabled={profileImageUploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadProfileImage(file);
                      }}
                    />
                  </label>
                  {profileImageUrl && (
                    <div
                      style={{ fontSize: 11, color: "#6b7280", marginTop: 6, wordBreak: "break-all" }}
                    >
                      {profileImageUrl.split("/").pop()}
                    </div>
                  )}
                </div>
              </div>
            </FieldBlock>

            <FieldBlock label="שירותים">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {ALL_SERVICES.map((svc) => (
                  <button
                    key={svc}
                    onClick={() => toggleService(svc)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 10,
                      border: services.includes(svc)
                        ? "1px solid #7c3aed"
                        : "1px solid rgba(139,92,246,0.25)",
                      background: services.includes(svc)
                        ? "rgba(124,58,237,0.35)"
                        : "rgba(255,255,255,0.04)",
                      color: services.includes(svc) ? "#c4b5fd" : "#9ca3af",
                      fontSize: 13,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {SERVICE_ICONS[svc]} {SERVICE_LABELS[svc]}
                  </button>
                ))}
              </div>
            </FieldBlock>

            {saveMsg && (
              <div
                style={{
                  background: saveMsg.includes("שגיאה")
                    ? "rgba(239,68,68,0.15)"
                    : "rgba(16,185,129,0.15)",
                  border: saveMsg.includes("שגיאה")
                    ? "1px solid rgba(239,68,68,0.4)"
                    : "1px solid rgba(16,185,129,0.4)",
                  borderRadius: 10,
                  padding: "10px 14px",
                  color: saveMsg.includes("שגיאה") ? "#fca5a5" : "#6ee7b7",
                  fontSize: 14,
                }}
              >
                {saveMsg}
              </div>
            )}

            <button
              onClick={saveProfile}
              disabled={saving}
              style={{
                padding: "14px",
                borderRadius: 12,
                border: "none",
                background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
                color: "#fff",
                fontSize: 15,
                fontWeight: 700,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
                fontFamily: "inherit",
              }}
            >
              {saving ? "שומר…" : "שמור שינויים"}
            </button>
          </div>
        )}

        {/* Reviews tab */}
        {activeTab === "reviews" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {reviews.length === 0 && (
              <div style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", padding: 40 }}>
                אין המלצות עדיין
              </div>
            )}
            {reviews.map((review) => (
              <div
                key={review.id}
                style={{
                  background: review.isHidden
                    ? "rgba(255,255,255,0.02)"
                    : "rgba(255,255,255,0.05)",
                  border: `1px solid ${review.isHidden ? "rgba(107,114,128,0.2)" : "rgba(139,92,246,0.2)"}`,
                  borderRadius: 14,
                  padding: "14px 16px",
                  opacity: review.isHidden ? 0.5 : 1,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 10,
                    marginBottom: 8,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: "#e5e7eb", fontSize: 14 }}>
                      {review.reviewerName}
                      {review.isHidden && (
                        <span
                          style={{
                            marginRight: 8,
                            background: "rgba(107,114,128,0.3)",
                            borderRadius: 6,
                            padding: "2px 6px",
                            fontSize: 11,
                            color: "#9ca3af",
                            fontWeight: 400,
                          }}
                        >
                          מוסתר
                        </span>
                      )}
                    </div>
                    <StarRating rating={review.rating} size={14} />
                  </div>
                  <button
                    onClick={() => toggleReview(review.id, !review.isHidden)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 8,
                      border: `1px solid ${review.isHidden ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.3)"}`,
                      background: review.isHidden
                        ? "rgba(16,185,129,0.1)"
                        : "rgba(239,68,68,0.1)",
                      color: review.isHidden ? "#6ee7b7" : "#fca5a5",
                      fontSize: 12,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {review.isHidden ? "הצג" : "הסתר"}
                  </button>
                </div>
                <div style={{ color: "#d1d5db", fontSize: 13, lineHeight: 1.5 }}>
                  {review.text}
                </div>
                <div style={{ color: "#6b7280", fontSize: 11, marginTop: 8 }}>
                  {review.createdAt instanceof Date
                    ? review.createdAt.toLocaleDateString("he-IL")
                    : new Date(review.createdAt).toLocaleDateString("he-IL")}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Photos tab */}
        {activeTab === "photos" && (
          <div>
            {/* Upload button */}
            <label
              style={{
                display: "block",
                padding: "16px",
                borderRadius: 14,
                border: "2px dashed rgba(139,92,246,0.3)",
                background: "rgba(124,58,237,0.05)",
                color: "#9ca3af",
                fontSize: 14,
                cursor: photoUploading ? "not-allowed" : "pointer",
                textAlign: "center",
                marginBottom: 16,
                fontFamily: "inherit",
              }}
            >
              {photoUploading ? "מעלה…" : "📸 הוסף תמונה חדשה"}
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                disabled={photoUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadPhoto(file);
                }}
              />
            </label>

            {photos.length === 0 && (
              <div style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", padding: 40 }}>
                אין תמונות עדיין
              </div>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 10,
              }}
            >
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  style={{
                    borderRadius: 14,
                    overflow: "hidden",
                    border: `1px solid ${photo.isHidden ? "rgba(107,114,128,0.2)" : "rgba(139,92,246,0.2)"}`,
                    opacity: photo.isHidden ? 0.5 : 1,
                    position: "relative",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt=""
                    style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }}
                  />
                  <div
                    style={{
                      padding: "8px 10px",
                      background: "rgba(13,13,26,0.9)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 6,
                    }}
                  >
                    <span style={{ fontSize: 10, color: "#9ca3af" }}>
                      {photo.uploadedBy === "mover" ? "שלך" : "לקוח"}
                      {photo.isHidden && " • מוסתר"}
                    </span>
                    <button
                      onClick={() => togglePhoto(photo.id, !photo.isHidden)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 6,
                        border: `1px solid ${photo.isHidden ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.3)"}`,
                        background: photo.isHidden
                          ? "rgba(16,185,129,0.1)"
                          : "rgba(239,68,68,0.1)",
                        color: photo.isHidden ? "#6ee7b7" : "#fca5a5",
                        fontSize: 11,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {photo.isHidden ? "הצג" : "הסתר"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(139,92,246,0.3)",
  background: "rgba(255,255,255,0.05)",
  color: "#f9fafb",
  fontSize: 14,
  outline: "none",
  fontFamily: "var(--font-rubik), Rubik, sans-serif",
};
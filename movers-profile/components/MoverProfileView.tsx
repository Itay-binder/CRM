"use client";

import { useState } from "react";
import StarRating from "./StarRating";
import type { PublicMoverData, MoverReview, MoverPhoto } from "../types";
import { SERVICE_LABELS, SERVICE_ICONS } from "../types";

type Props = {
  data: PublicMoverData;
};

type ReviewForm = {
  reviewerName: string;
  rating: number;
  text: string;
};

export default function MoverProfileView({ data }: Props) {
  const [reviews, setReviews] = useState<MoverReview[]>(data.reviews);
  const [photos, setPhotos] = useState<MoverPhoto[]>(data.photos);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewForm, setReviewForm] = useState<ReviewForm>({ reviewerName: "", rating: 5, text: "" });
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [activeReviewIdx, setActiveReviewIdx] = useState(0);
  const [shareTooltip, setShareTooltip] = useState(false);

  const ratingMax = Math.max(1, ...Object.values(data.ratingBreakdown));

  async function submitReview() {
    if (!reviewForm.reviewerName.trim() || !reviewForm.text.trim()) return;
    setSubmittingReview(true);
    try {
      const res = await fetch(`/api/movers/${data.slug}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reviewForm),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.review) setReviews((prev) => [json.review, ...prev]);
        setShowReviewForm(false);
        setReviewSuccess(true);
        setReviewForm({ reviewerName: "", rating: 5, text: "" });
        setTimeout(() => setReviewSuccess(false), 4000);
      }
    } finally {
      setSubmittingReview(false);
    }
  }

  async function uploadPhoto(file: File) {
    setPhotoUploading(true);
    try {
      // Get signed upload URL from server
      const presignRes = await fetch(`/api/movers/${data.slug}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileType: file.type }),
      });
      if (!presignRes.ok) return;
      const { uploadUrl, photoUrl, photoId } = await presignRes.json();

      // Upload to Firebase Storage via signed URL
      await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      // Confirm upload
      const confirmRes = await fetch(`/api/movers/${data.slug}/photos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId }),
      });
      if (confirmRes.ok) {
        const json = await confirmRes.json();
        if (json.photo) setPhotos((prev) => [json.photo, ...prev]);
      }
    } finally {
      setPhotoUploading(false);
    }
  }

  function handleShare() {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: `${data.name} - LiftyGo`, url });
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setShareTooltip(true);
        setTimeout(() => setShareTooltip(false), 2000);
      });
    }
  }

  const visibleReviews = reviews.filter((r) => !r.isHidden);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0d0d1a 0%, #130d2b 100%)",
        fontFamily: "var(--font-rubik), Rubik, sans-serif",
        direction: "rtl",
        color: "#f9fafb",
        paddingBottom: 100,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 24px 16px",
          borderBottom: "1px solid rgba(139,92,246,0.15)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 22, fontWeight: 900, color: "#a78bfa" }}>✦</span>
          <span style={{ fontWeight: 900, fontSize: 18, color: "#f9fafb" }}>LiftyGo</span>
        </div>
        <div
          style={{
            background: "rgba(139,92,246,0.2)",
            border: "1px solid rgba(139,92,246,0.4)",
            borderRadius: 20,
            padding: "4px 14px",
            fontSize: 11,
            color: "#c4b5fd",
            fontWeight: 600,
          }}
        >
          כרטיס מוביל דיגיטלי
        </div>
      </div>

      {/* Main card */}
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 16px" }}>
        {/* Profile header */}
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(139,92,246,0.25)",
            backdropFilter: "blur(20px)",
            borderRadius: 20,
            padding: "24px 20px 20px",
            marginTop: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            {/* Profile image */}
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                border: "3px solid #7c3aed",
                overflow: "hidden",
                flexShrink: 0,
                background: "rgba(124,58,237,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 32,
              }}
            >
              {data.profileImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.profileImageUrl}
                  alt={data.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                "👤"
              )}
            </div>

            <div style={{ flex: 1 }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "rgba(124,58,237,0.25)",
                  border: "1px solid rgba(124,58,237,0.5)",
                  borderRadius: 20,
                  padding: "3px 10px",
                  fontSize: 11,
                  color: "#c4b5fd",
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                <span>✓</span>
                <span>מוביל מאומת LiftyGo</span>
              </div>
              <div style={{ fontWeight: 900, fontSize: 22, color: "#f9fafb", lineHeight: 1.2 }}>
                {data.name}
              </div>
              <div style={{ color: "#9ca3af", fontSize: 13, marginTop: 4 }}>
                מוביל מקצועי
              </div>
              {data.coverArea && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6, color: "#9ca3af", fontSize: 13 }}>
                  <span>📍</span>
                  <span>{data.coverArea}</span>
                </div>
              )}
            </div>
          </div>

          {/* Bio */}
          {data.bio && (
            <div
              style={{
                marginTop: 16,
                color: "#d1d5db",
                fontSize: 14,
                lineHeight: 1.6,
                borderTop: "1px solid rgba(139,92,246,0.15)",
                paddingTop: 14,
              }}
            >
              {data.bio}
            </div>
          )}

          {/* Services */}
          {data.services.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 16,
                flexWrap: "wrap",
              }}
            >
              {data.services.map((svc) => (
                <div
                  key={svc}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    background: "rgba(124,58,237,0.12)",
                    border: "1px solid rgba(124,58,237,0.25)",
                    borderRadius: 12,
                    padding: "8px 12px",
                    fontSize: 11,
                    color: "#c4b5fd",
                    flex: "1 1 70px",
                    textAlign: "center",
                  }}
                >
                  <span style={{ fontSize: 20 }}>{SERVICE_ICONS[svc]}</span>
                  <span>{SERVICE_LABELS[svc]}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rating */}
        {data.reviewCount > 0 && (
          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(139,92,246,0.25)",
              backdropFilter: "blur(20px)",
              borderRadius: 20,
              padding: "20px",
              marginTop: 16,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 14, color: "#c4b5fd", marginBottom: 14 }}>
              הדירוג שלי
            </div>
            <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontWeight: 900, fontSize: 48, color: "#f9fafb", lineHeight: 1 }}>
                  {data.rating.toFixed(1)}
                </div>
                <StarRating rating={data.rating} size={18} />
                <div style={{ color: "#9ca3af", fontSize: 11, marginTop: 4 }}>
                  מבוסס על {data.reviewCount} דירוגים
                </div>
              </div>
              <div style={{ flex: 1 }}>
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = data.ratingBreakdown[star] ?? 0;
                  const pct = ratingMax > 0 ? (count / ratingMax) * 100 : 0;
                  return (
                    <div
                      key={star}
                      style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}
                    >
                      <span style={{ color: "#f59e0b", fontSize: 12, width: 14, textAlign: "center" }}>
                        {star}★
                      </span>
                      <div
                        style={{
                          flex: 1,
                          height: 6,
                          borderRadius: 3,
                          background: "rgba(255,255,255,0.1)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            height: "100%",
                            background: "linear-gradient(90deg, #7c3aed, #a855f7)",
                            borderRadius: 3,
                            transition: "width 0.6s ease",
                          }}
                        />
                      </div>
                      <span style={{ color: "#9ca3af", fontSize: 11, width: 24, textAlign: "center" }}>
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Reviews */}
        {visibleReviews.length > 0 && (
          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(139,92,246,0.25)",
              backdropFilter: "blur(20px)",
              borderRadius: 20,
              padding: "20px",
              marginTop: 16,
              overflow: "hidden",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 14, color: "#c4b5fd", marginBottom: 14 }}>
              💬 המלצות מלקוחות
            </div>

            {/* Single review display with navigation */}
            <div
              style={{
                background: "rgba(124,58,237,0.1)",
                border: "1px solid rgba(124,58,237,0.2)",
                borderRadius: 16,
                padding: 16,
              }}
            >
              <div style={{ fontSize: 28, color: "#7c3aed", lineHeight: 1, marginBottom: 8 }}>&ldquo;</div>
              <div style={{ color: "#e5e7eb", fontSize: 14, lineHeight: 1.6, minHeight: 60 }}>
                {visibleReviews[activeReviewIdx]?.text}
              </div>
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#c4b5fd" }}>
                    {visibleReviews[activeReviewIdx]?.reviewerName}
                  </div>
                  <StarRating rating={visibleReviews[activeReviewIdx]?.rating ?? 5} size={14} />
                </div>
              </div>
            </div>

            {/* Dots navigation */}
            {visibleReviews.length > 1 && (
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
                {visibleReviews.slice(0, 6).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveReviewIdx(i)}
                    style={{
                      width: i === activeReviewIdx ? 20 : 8,
                      height: 8,
                      borderRadius: 4,
                      background: i === activeReviewIdx ? "#7c3aed" : "rgba(139,92,246,0.3)",
                      border: "none",
                      cursor: "pointer",
                      transition: "all 0.3s ease",
                      padding: 0,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Photos */}
        {photos.filter((p) => !p.isHidden).length > 0 && (
          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(139,92,246,0.25)",
              backdropFilter: "blur(20px)",
              borderRadius: 20,
              padding: "20px",
              marginTop: 16,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 14, color: "#c4b5fd", marginBottom: 14 }}>
              📸 תמונות מהובלות
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 8,
              }}
            >
              {photos
                .filter((p) => !p.isHidden)
                .slice(0, 6)
                .map((photo) => (
                  <div
                    key={photo.id}
                    style={{
                      aspectRatio: "1",
                      borderRadius: 12,
                      overflow: "hidden",
                      background: "rgba(124,58,237,0.15)",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Add review */}
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(139,92,246,0.25)",
            backdropFilter: "blur(20px)",
            borderRadius: 20,
            padding: "20px",
            marginTop: 16,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 14, color: "#c4b5fd", marginBottom: 14 }}>
            דרג ✍️ שתף חוויה
          </div>

          {reviewSuccess && (
            <div
              style={{
                background: "rgba(16,185,129,0.15)",
                border: "1px solid rgba(16,185,129,0.4)",
                borderRadius: 10,
                padding: "10px 14px",
                color: "#6ee7b7",
                fontSize: 13,
                marginBottom: 14,
              }}
            >
              תודה! ההמלצה שלך נשלחה בהצלחה 🎉
            </div>
          )}

          {!showReviewForm ? (
            <button
              onClick={() => setShowReviewForm(true)}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 12,
                border: "1px solid rgba(139,92,246,0.4)",
                background: "rgba(124,58,237,0.1)",
                color: "#c4b5fd",
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              + הוסף המלצה ודירוג
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input
                type="text"
                placeholder="השם שלך"
                value={reviewForm.reviewerName}
                onChange={(e) => setReviewForm((f) => ({ ...f, reviewerName: e.target.value }))}
                style={inputStyle}
              />
              <div>
                <div style={{ color: "#9ca3af", fontSize: 12, marginBottom: 6 }}>הדירוג שלך</div>
                <StarRating
                  rating={reviewForm.rating}
                  size={32}
                  interactive
                  onRate={(r) => setReviewForm((f) => ({ ...f, rating: r }))}
                />
              </div>
              <textarea
                placeholder="ספר על החוויה שלך עם המוביל..."
                value={reviewForm.text}
                onChange={(e) => setReviewForm((f) => ({ ...f, text: e.target.value }))}
                rows={3}
                style={{ ...inputStyle, resize: "vertical" as const }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={submitReview}
                  disabled={submittingReview || !reviewForm.reviewerName.trim() || !reviewForm.text.trim()}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: 12,
                    border: "none",
                    background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: submittingReview ? "not-allowed" : "pointer",
                    opacity: submittingReview ? 0.6 : 1,
                    fontFamily: "inherit",
                  }}
                >
                  {submittingReview ? "שולח…" : "שלח המלצה"}
                </button>
                <button
                  onClick={() => { setShowReviewForm(false); setReviewForm({ reviewerName: "", rating: 5, text: "" }); }}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 12,
                    border: "1px solid rgba(139,92,246,0.3)",
                    background: "transparent",
                    color: "#9ca3af",
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

          {/* Customer photo upload */}
          <div style={{ marginTop: 12 }}>
            <label
              style={{
                display: "block",
                width: "100%",
                padding: "10px",
                borderRadius: 12,
                border: "1px dashed rgba(139,92,246,0.3)",
                background: "transparent",
                color: "#9ca3af",
                fontSize: 13,
                cursor: photoUploading ? "not-allowed" : "pointer",
                textAlign: "center",
                fontFamily: "inherit",
              }}
            >
              {photoUploading ? "מעלה תמונה…" : "📷 הוסף תמונה מההובלה"}
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
          </div>
        </div>

        {/* Bottom action bar */}
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "rgba(13,13,26,0.95)",
            backdropFilter: "blur(20px)",
            borderTop: "1px solid rgba(139,92,246,0.2)",
            padding: "14px 16px",
            display: "flex",
            gap: 10,
            maxWidth: 480,
            margin: "0 auto",
          }}
        >
          <button
            onClick={handleShare}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontFamily: "inherit",
              position: "relative",
            }}
          >
            🔗 {shareTooltip ? "הועתק!" : "שיתוף הכרטיס"}
          </button>
          <a
            href={`tel:${data.phone}`}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid rgba(139,92,246,0.4)",
              background: "rgba(124,58,237,0.1)",
              color: "#c4b5fd",
              fontSize: 14,
              fontWeight: 700,
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            📞
          </a>
          <a
            href={`https://wa.me/${data.phone.replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: "none",
              background: "#25d366",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            💬
          </a>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(139,92,246,0.3)",
  background: "rgba(255,255,255,0.06)",
  color: "#f9fafb",
  fontSize: 14,
  outline: "none",
  fontFamily: "var(--font-rubik), Rubik, sans-serif",
};
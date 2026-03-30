"use client";

import { type ReactNode, useState } from "react";

/** זיהוי עמודות מייל/טלפון לפי שם (כולל contact_email, opportunity_phone וכו׳) */
export function columnIntegrationKind(col: string): "email" | "phone" | null {
  const k = col.trim().toLowerCase().replace(/[\s-]+/g, "");
  if (k === "email" || k.endsWith("email")) return "email";
  if (k === "phone" || k === "mobile" || k === "tel" || k === "cell" || k.endsWith("phone"))
    return "phone";
  return null;
}

function extractEmail(raw: string): string | null {
  const m = raw.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
  if (m) return m[0];
  const t = raw.trim();
  return t.includes("@") ? t.split(/\s+/)[0] : null;
}

function phoneForTel(raw: string): string {
  return raw.replace(/[^\d+]/g, "").trim() || raw.trim();
}

function phoneForWhatsApp(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("972")) return d;
  if (d.startsWith("0") && d.length >= 9) return `972${d.slice(1)}`;
  if (d.length >= 8) return d;
  return null;
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type Props = {
  readonly?: boolean;
  integration?: "email" | "phone" | null;
  /** ערך גולמי ל-mailto / tel / wa.me */
  rawValue: string;
  /** טקסט המוצג בתא */
  label: ReactNode;
  onEdit: () => void;
};

export function InlineFieldShell({
  readonly,
  integration,
  rawValue,
  label,
  onEdit,
}: Props) {
  const [hover, setHover] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const showChrome = !readonly && (hover || focusWithin);

  const borderColor = showChrome ? "#2563eb" : "transparent";

  let valueEl: ReactNode;

  if (!readonly && integration === "email") {
    const em = extractEmail(rawValue);
    if (em) {
      valueEl = (
        <a
          href={`mailto:${encodeURIComponent(em).replace(/%40/g, "@")}`}
          style={{
            flex: 1,
            textAlign: "right",
            color: "#2563eb",
            wordBreak: "break-word",
            textDecoration: "underline",
            textUnderlineOffset: 2,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {label}
        </a>
      );
    } else {
      valueEl = (
        <span style={{ flex: 1, textAlign: "right", wordBreak: "break-word", color: "#111827" }}>
          {label}
        </span>
      );
    }
  } else if (!readonly && integration === "phone") {
    const tel = phoneForTel(rawValue);
    const wa = phoneForWhatsApp(rawValue);
    valueEl = (
      <span
        style={{
          flex: 1,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 8,
          wordBreak: "break-word",
        }}
      >
        {tel ? (
          <a
            href={`tel:${tel}`}
            style={{ color: "#2563eb", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 2 }}
            onClick={(e) => e.stopPropagation()}
          >
            {label}
          </a>
        ) : (
          <span style={{ color: "#111827" }}>{label}</span>
        )}
        {wa ? (
          <a
            href={`https://wa.me/${wa}`}
            target="_blank"
            rel="noopener noreferrer"
            title="וואטסאפ"
            onClick={(e) => e.stopPropagation()}
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: "#16a34a",
              whiteSpace: "nowrap",
              textDecoration: "none",
              border: "1px solid #bbf7d0",
              borderRadius: 6,
              padding: "2px 8px",
              background: "#f0fdf4",
            }}
          >
            וואטסאפ
          </a>
        ) : null}
      </span>
    );
  } else {
    valueEl = (
      <span style={{ flex: 1, textAlign: "right", wordBreak: "break-word", color: "#111827" }}>
        {label}
      </span>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        minHeight: 34,
        padding: "4px 6px",
        borderRadius: 8,
        border: `2px solid ${borderColor}`,
        boxSizing: "border-box",
        transition: "border-color 0.12s ease",
        direction: "rtl",
      }}
      data-inline-field-shell
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={(e) => {
        const rt = e.relatedTarget as Node | null;
        if (!rt || !(e.currentTarget as HTMLElement).contains(rt)) setFocusWithin(false);
      }}
    >
      {valueEl}
      {!readonly ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          title="עריכה מהירה"
          aria-label="עריכה מהירה"
          style={{
            flexShrink: 0,
            width: 32,
            height: 32,
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            background: "#fff",
            color: "#6b7280",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: showChrome ? 1 : 0,
            pointerEvents: showChrome ? "auto" : "none",
            transition: "opacity 0.12s ease",
          }}
        >
          <PencilIcon />
        </button>
      ) : null}
    </div>
  );
}

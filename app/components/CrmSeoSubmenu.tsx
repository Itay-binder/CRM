"use client";

import { useState } from "react";
import CrmNavLink from "@/app/components/CrmNavLink";

export default function CrmSeoSubmenu() {
  const [open, setOpen] = useState(true);

  return (
    <div
      style={{
        marginTop: 6,
        paddingTop: 10,
        borderTop: "1px solid #e5e7eb",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "6px 4px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          fontSize: 11,
          fontWeight: 700,
          color: "#9ca3af",
          letterSpacing: "0.02em",
        }}
        aria-expanded={open}
      >
        <span>SEO</span>
        <span aria-hidden style={{ fontSize: 10, opacity: 0.85 }}>
          {open ? "▾" : "◂"}
        </span>
      </button>
      {open ? (
        <div
          style={{
            display: "grid",
            gap: 4,
            marginTop: 6,
            paddingInlineStart: 6,
            borderInlineStart: "2px solid #e5e7eb",
          }}
        >
          <CrmNavLink href="/seo" label="יצירת מאמר SEO" exact />
          <CrmNavLink href="/seo/dashboard" label="דשבורד SEO" />
          <CrmNavLink href="/seo/settings" label="הגדרות סוכן SEO" />
        </div>
      ) : null}
    </div>
  );
}

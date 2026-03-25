"use client";

import { useMemo, useState } from "react";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";

type Props = {
  email: string | null | undefined;
};

function avatarLetter(email: string | null | undefined): string {
  const s = email?.trim() ?? "";
  if (!s) return "?";
  const ch = s[0];
  return /[a-z]/i.test(ch) ? ch.toUpperCase() : ch;
}

export default function UserMenu({ email }: Props) {
  const [open, setOpen] = useState(false);

  const onLogout = async () => {
    setOpen(false);
    try {
      await signOut(getFirebaseAuth());
    } catch {
      // ignore
    }
    await fetch("/api/auth/session", { method: "DELETE", credentials: "include" });
    window.location.href = "/login";
  };

  const letter = useMemo(() => avatarLetter(email), [email]);

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="תפריט משתמש"
        style={{
          width: 40,
          height: 40,
          borderRadius: "999px",
          border: "none",
          cursor: "pointer",
          background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
          color: "#fff",
          fontWeight: 700,
          fontSize: 16,
        }}
      >
        {letter}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            left: 0,
            top: "calc(100% + 8px)",
            zIndex: 50,
            minWidth: 240,
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "#fff",
            boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
            padding: 10,
          }}
        >
          <div
            dir="ltr"
            style={{
              padding: "8px 12px",
              fontSize: 12,
              wordBreak: "break-all",
              color: "#111827",
              fontWeight: 500,
              borderBottom: "1px solid #f3f4f6",
              marginBottom: 8,
            }}
          >
            {email ?? "—"}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => void onLogout()}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "#7f1d1d",
              fontWeight: 600,
            }}
          >
            התנתקות
          </button>
        </div>
      )}
    </div>
  );
}


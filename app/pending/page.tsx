import { redirect } from "next/navigation";
import { getSessionWithProfile, authDisabled } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function PendingPage() {
  if (authDisabled()) redirect("/login");
  const s = await getSessionWithProfile();
  if (!s) redirect("/login?returnTo=/pending");

  if (s.profile.approved) {
    redirect("/dashboard");
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div
        style={{
          width: "min(520px, 92vw)",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 22,
          background: "#fff",
          boxShadow: "0 12px 40px rgba(0,0,0,0.06)",
          textAlign: "center",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22 }}>ממתין לאישור</h1>
        <p style={{ marginTop: 12, color: "#4b5563" }}>
          החשבון <strong dir="ltr">{s.profile.email}</strong> ממתין לאישור מנהל
          לפני גישה ל-CRM.
        </p>
        <button
          type="button"
          onClick={async () => {
            await fetch("/api/auth/session", { method: "DELETE", credentials: "include" });
            window.location.href = "/login";
          }}
          style={{
            marginTop: 16,
            padding: "12px 16px",
            borderRadius: 12,
            border: "none",
            cursor: "pointer",
            fontWeight: 700,
            background: "#111827",
            color: "#fff",
          }}
        >
          התנתקות
        </button>
      </div>
    </main>
  );
}


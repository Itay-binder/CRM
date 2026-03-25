import { redirect } from "next/navigation";
import { authDisabled, getSessionWithProfile } from "@/lib/auth/session";
import CrmShell from "@/app/components/CrmShell";

export const dynamic = "force-dynamic";

export default async function FieldsPage() {
  if (authDisabled()) redirect("/login");
  const s = await getSessionWithProfile();
  if (!s) redirect("/login?returnTo=/settings/fields");

  return (
    <CrmShell email={s.profile.email}>
      <div style={{ maxWidth: 900 }}>
        <h1 style={{ margin: "4px 0 10px", fontSize: 20 }}>שדות מותאמים (MVP)</h1>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16 }}>
          כרגע זה מסך שלד בלבד. בהמשך ניישם:
          <div style={{ marginTop: 10, color: "#6b7280", fontWeight: 700, lineHeight: 1.7 }}>
            1. יצירה/עריכה של `Custom Fields` ב-Firestore
            <br />
            2. מיפוי שדה ל-header ב-Google Sheets
            <br />
            3. אפשרות לדחוף ערכים דרך אוטומציות (Make/Webhooks) באמצעות ID אחיד לשדה
          </div>
        </div>
      </div>
    </CrmShell>
  );
}


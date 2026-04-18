"use client";

import { useCallback, useEffect, useState } from "react";
import SettingsSectionNav from "@/app/components/SettingsSectionNav";
import {
  loadCrmNotificationPrefs,
  saveCrmNotificationPrefs,
  type CrmNotificationPrefs,
} from "@/app/components/CrmGlobalNotifications";

type Props = {
  showMovingOrders?: boolean;
};

export default function NotificationsClient({ showMovingOrders }: Props) {
  const [prefs, setPrefs] = useState<CrmNotificationPrefs>(() => loadCrmNotificationPrefs());
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    setPrefs(loadCrmNotificationPrefs());
    if (typeof Notification === "undefined") setPerm("unsupported");
    else setPerm(Notification.permission);
  }, []);

  const persist = useCallback((next: CrmNotificationPrefs) => {
    setPrefs(next);
    saveCrmNotificationPrefs(next);
  }, []);

  const requestBrowserPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    try {
      const p = await Notification.requestPermission();
      setPerm(p);
    } catch {
      setPerm("denied");
    }
  }, []);

  const row = (label: string, description: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label
      style={{
        display: "grid",
        gap: 6,
        padding: "14px 16px",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        background: "#fafafa",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{label}</span>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          style={{ width: 18, height: 18 }}
        />
      </div>
      <span style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.45 }}>{description}</span>
    </label>
  );

  return (
    <>
      <SettingsSectionNav active="notifications" showMovingOrders={showMovingOrders} />
      <div style={{ maxWidth: 720 }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 800 }}>התראות</h1>
        <p style={{ margin: "0 0 22px", fontSize: 14, color: "#6b7280", lineHeight: 1.55 }}>
          התראות צפות בתוך ה־CRM (בזמן שימוש במערכת), ובנוסף אפשר להפעיל התראות מערכת מהדפדפן — כולל בטלפון כשהדפדפן מורשה (Chrome/Safari לפי מדיניות המכשיר).
        </p>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 12px" }}>בתוך המערכת</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {row(
              "התראה צפה — הודעת וואטסאפ נכנסת",
              "כרטיס בתחתית המסך עם מספר השולח וכפתור מעבר לצ׳אטים.",
              prefs.inAppWhatsApp,
              (v) => persist({ ...prefs, inAppWhatsApp: v })
            )}
            {row(
              "התראה צפה — ליד חדש",
              "כרטיס כשנוצר איש קשר חדש (הליד העדכני ביותר במערכת השתנה).",
              prefs.inAppNewLead,
              (v) => persist({ ...prefs, inAppNewLead: v })
            )}
          </div>
        </section>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 12px" }}>התראות דפדפן / מכשיר</h2>
          <div
            style={{
              padding: "14px 16px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "#fff",
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>הרשאת התראות</div>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
              לחיצה על הכפתור תפתח את בקשת ההרשאה של הדפדפן (או של המערכת בטלפון). רק אחרי אישור תופיע התראה מחוץ ללשונית ה־CRM.
            </p>
            {perm === "unsupported" ? (
              <div style={{ fontSize: 13, color: "#b45309" }}>הדפדפן אינו תומך ב־Notification API.</div>
            ) : (
              <>
                <div style={{ fontSize: 13, marginBottom: 10 }}>
                  סטטוס נוכחי:{" "}
                  <strong dir="ltr">
                    {perm === "granted" ? "מאושר" : perm === "denied" ? "חסום" : "לא נשאל"}
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={() => void requestBrowserPermission()}
                  disabled={perm === "denied"}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 10,
                    border: "none",
                    fontWeight: 700,
                    cursor: perm === "denied" ? "not-allowed" : "pointer",
                    background:
                      perm === "denied"
                        ? "#e5e7eb"
                        : "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
                    color: perm === "denied" ? "#6b7280" : "#fff",
                  }}
                >
                  בקש הרשאת התראות מהדפדפן / מהמכשיר
                </button>
                {perm === "denied" ? (
                  <p style={{ margin: "10px 0 0", fontSize: 12, color: "#b45309" }}>
                    ההרשאה נחסמה בהגדרות הדפדפן או המכשיר — יש לאפשר שם ידנית כדי לקבל התראות.
                  </p>
                ) : null}
              </>
            )}
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {row(
              "התראת דפדפן — וואטסאפ",
              "מופעל רק אם ההרשאה מאושרת וגם אפשרות זו מסומנת.",
              prefs.browserWhatsApp,
              (v) => persist({ ...prefs, browserWhatsApp: v })
            )}
            {row(
              "התראת דפדפן — ליד חדש",
              "מופעל רק אם ההרשאה מאושרת וגם אפשרות זו מסומנת.",
              prefs.browserNewLead,
              (v) => persist({ ...prefs, browserNewLead: v })
            )}
          </div>
        </section>
      </div>
    </>
  );
}

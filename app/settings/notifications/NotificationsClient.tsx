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

type DevicePushPrefs = {
  whatsapp: boolean;
  newLead: boolean;
  newOrder: boolean;
};

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export default function NotificationsClient({ showMovingOrders }: Props) {
  const [prefs, setPrefs] = useState<CrmNotificationPrefs>(() => loadCrmNotificationPrefs());
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [devicePrefs, setDevicePrefs] = useState<DevicePushPrefs>({
    whatsapp: true,
    newLead: true,
    newOrder: true,
  });
  const [pushConfigured, setPushConfigured] = useState(false);
  const [subscriptionCount, setSubscriptionCount] = useState(0);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  useEffect(() => {
    setPrefs(loadCrmNotificationPrefs());
    if (typeof Notification === "undefined") setPerm("unsupported");
    else setPerm(Notification.permission);
  }, []);

  const loadPushState = useCallback(async () => {
    try {
      const res = await fetch("/api/push/prefs", { credentials: "include", cache: "no-store" });
      const j = await parseJson<{
        ok?: boolean;
        webPushConfigured?: boolean;
        prefs?: DevicePushPrefs;
        subscriptionCount?: number;
      }>(res);
      if (!res.ok || !j.ok) return;
      setPushConfigured(Boolean(j.webPushConfigured));
      if (j.prefs) setDevicePrefs(j.prefs);
      setSubscriptionCount(typeof j.subscriptionCount === "number" ? j.subscriptionCount : 0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadPushState();
  }, [loadPushState]);

  const persist = useCallback((next: CrmNotificationPrefs) => {
    setPrefs(next);
    saveCrmNotificationPrefs(next);
  }, []);

  const patchDevicePrefs = useCallback(async (next: DevicePushPrefs) => {
    setDevicePrefs(next);
    try {
      const res = await fetch("/api/push/prefs", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const j = await parseJson<{ ok?: boolean; prefs?: DevicePushPrefs }>(res);
      if (res.ok && j.ok && j.prefs) setDevicePrefs(j.prefs);
    } catch {
      /* ignore */
    }
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

  const registerWebPush = useCallback(async () => {
    setPushMsg(null);
    if (!VAPID_PUBLIC) {
      setPushMsg("חסר מפתח VAPID בשרת — הגדרו NEXT_PUBLIC_VAPID_PUBLIC_KEY ו־VAPID_PRIVATE_KEY.");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushMsg("הדפדפן לא תומך ב־Web Push.");
      return;
    }
    setPushBusy(true);
    try {
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p !== "granted") {
        setPushMsg("לא אושרה הרשאת התראות — לא ניתן להפעיל דחיפה למכשיר.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/crm-push-sw.js", { scope: "/" });
      await reg.update();
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();
      const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          devicePushPrefs: devicePrefs,
        }),
      });
      const j = await parseJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "הרשמה נכשלה");
      setPushMsg("התראות דחיפה הופעלו למכשיר זה.");
      await loadPushState();
    } catch (e) {
      setPushMsg(e instanceof Error ? e.message : "הרשמה נכשלה");
    } finally {
      setPushBusy(false);
    }
  }, [devicePrefs, loadPushState]);

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
          התראות צפות בתוך ה־CRM (בחלק העליון של המסך), ובנוסף אפשר התראות מהדפדפן או דחיפה אמיתית למכשיר כשהמערכת
          סגורה — ראו למטה.
        </p>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 12px" }}>בתוך המערכת</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {row(
              "התראה צפה — הודעת וואטסאפ נכנסת",
              "כרטיס בראש המסך עם מספר השולח וכפתור מעבר לצ׳אטים.",
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
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 12px" }}>
            התראות דחיפה למכשיר (Web Push)
          </h2>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280", lineHeight: 1.55 }}>
            כאן נשלחות התראות דרך <strong>שרת</strong> — גם כשהדפדפן ברקע, המסך כבוי או (במכשירים נתמכים) במסך נעילה.
            <strong> מצב «נא לא להפריע»</strong> ועדיפות התראה נקבעים בהגדרות <strong>מערכת ההפעלה</strong> ובאפליקציית
            הדפדפן (Chrome/Safari); לא ניתן לעקוף אותם מתוך האתר. ב־iOS מומלץ להוסיף את האתר למסך הבית (PWA)
            כדי לקבל דחיפה ברקע.
          </p>
          {!VAPID_PUBLIC || !pushConfigured ? (
            <div
              style={{
                marginBottom: 12,
                padding: 12,
                borderRadius: 10,
                background: "#fffbeb",
                color: "#92400e",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              להפעלת דחיפה יש להגדיר ב־Vercel / בשרת: <code dir="ltr">NEXT_PUBLIC_VAPID_PUBLIC_KEY</code>,{" "}
              <code dir="ltr">VAPID_PRIVATE_KEY</code>, ואופציונלית <code dir="ltr">VAPID_SUBJECT</code> (למשל
              mailto:). יצירת מפתחות: <code dir="ltr">npx web-push generate-vapid-keys</code>.
            </div>
          ) : null}
          <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
            {row(
              "דחיפה — הודעת וואטסאפ נכנסת",
              "נשלח כשנכנסת הודעה לווטסאפ העסקי (אחרי אישור הרשמה למטה).",
              devicePrefs.whatsapp,
              (v) => void patchDevicePrefs({ ...devicePrefs, whatsapp: v })
            )}
            {row(
              "דחיפה — ליד חדש",
              "נשלח כשנוצר איש קשר חדש במסד הנוכחי.",
              devicePrefs.newLead,
              (v) => void patchDevicePrefs({ ...devicePrefs, newLead: v })
            )}
            {showMovingOrders ? (
              row(
                "דחיפה — הזמנה חדשה",
                "נשלח כשנוצרת הזמנת הובלה חדשה (קליטה / ידני).",
                devicePrefs.newOrder,
                (v) => void patchDevicePrefs({ ...devicePrefs, newOrder: v })
              )
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void registerWebPush()}
            disabled={pushBusy || !VAPID_PUBLIC || !pushConfigured}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "none",
              fontWeight: 700,
              cursor: pushBusy || !VAPID_PUBLIC || !pushConfigured ? "not-allowed" : "pointer",
              background:
                pushBusy || !VAPID_PUBLIC || !pushConfigured
                  ? "#e5e7eb"
                  : "linear-gradient(180deg, #0d9488 0%, #0f766e 100%)",
              color: pushBusy || !VAPID_PUBLIC || !pushConfigured ? "#6b7280" : "#fff",
            }}
          >
            {pushBusy ? "מרשם…" : "הפעל התראות דחיפה למכשיר (אישור הרשאות)"}
          </button>
          {subscriptionCount > 0 ? (
            <p style={{ margin: "10px 0 0", fontSize: 12, color: "#059669", fontWeight: 600 }}>
              מכשיר זה רשום לדחיפה ({subscriptionCount} מנוי).
            </p>
          ) : null}
          {pushMsg ? (
            <p style={{ margin: "10px 0 0", fontSize: 13, color: pushMsg.includes("נכשל") ? "#b91c1c" : "#0369a1" }}>
              {pushMsg}
            </p>
          ) : null}
        </section>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 12px" }}>התראות דפדפן (לשונית פתוחה)</h2>
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
              אלה התראות מערכת של הדפדפן בזמן שיש לשונית פתוחה או ברקע קרוב — לא תחליף מלא לדחיפה כשהאפליקציה
              סגורה.
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
                  בקש הרשאת התראות מהדפדפן
                </button>
                {perm === "denied" ? (
                  <p style={{ margin: "10px 0 0", fontSize: 12, color: "#b45309" }}>
                    ההרשאה נחסמה בהגדרות הדפדפן או המכשיר — יש לאפשר שם ידנית.
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

import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { headers } from "next/headers";
import { getTenantDatabaseIdOverride } from "@/lib/server/tenantDbContext";
import { TENANT_DB_HEADER, getTenantConfigs } from "@/lib/tenant/config";

let init = false;

function parseServiceAccountJson(raw: string): Record<string, unknown> {
  const direct = raw.trim();
  try {
    return JSON.parse(direct) as Record<string, unknown>;
  } catch {
    // Some env providers may materialize private_key with literal newlines.
    const patched = direct.replace(
      /"private_key"\s*:\s*"([\s\S]*?)"\s*,\s*"client_email"/,
      (_m, pk) => {
        const escaped = String(pk)
          .replace(/\\/g, "\\\\")
          .replace(/\r?\n/g, "\\n")
          .replace(/"/g, '\\"');
        return `"private_key":"${escaped}","client_email"`;
      }
    );
    return JSON.parse(patched) as Record<string, unknown>;
  }
}

export function ensureAdmin() {
  if (init) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON");

  const cred = parseServiceAccountJson(raw);
  if (typeof cred.private_key === "string") {
    cred.private_key = cred.private_key.replace(/\\n/g, "\n");
  }

  if (!admin.apps.length) {
    // Prefer explicit FIREBASE_STORAGE_BUCKET; fall back to the client-side bucket
    // (NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is always set when the Firebase web SDK is configured)
    // then derive from project_id — try classic appspot.com (Storage uses getAdminStorageBucketAsync
    // at runtime to pick the bucket that actually exists, including *.firebasestorage.app).
    const storageBucket =
      process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() ||
      (typeof cred.project_id === "string" ? `${cred.project_id}.appspot.com` : undefined);
    admin.initializeApp({
      credential: admin.credential.cert(cred as admin.ServiceAccount),
      ...(storageBucket ? { storageBucket } : {}),
    });
  }

  init = true;
}

export function getAdminAuth(): admin.auth.Auth {
  ensureAdmin();
  return admin.auth();
}

export function getFirestoreForDatabaseId(databaseId: string): admin.firestore.Firestore {
  ensureAdmin();
  const id = databaseId.trim();
  if (!id || id === "(default)") {
    return getFirestore();
  }
  return getFirestore(admin.app(), id);
}

export function fallbackTenantDatabaseId(): string {
  const env = process.env.FIRESTORE_DATABASE_ID?.trim();
  if (env) return env;
  const t = getTenantConfigs()[0];
  return t?.databaseId?.trim() || "(default)";
}

export async function getRequestTenantDatabaseId(): Promise<string> {
  const override = getTenantDatabaseIdOverride();
  if (override) return override;
  try {
    const h = await headers();
    const fromHeader = h.get(TENANT_DB_HEADER)?.trim();
    if (fromHeader) return fromHeader;
  } catch {
    // Outside an App Router request (e.g. build / scripts).
  }
  return fallbackTenantDatabaseId();
}

export async function getAdminDb(): Promise<admin.firestore.Firestore> {
  const id = await getRequestTenantDatabaseId();
  return getFirestoreForDatabaseId(id);
}

/**
 * מזהה מסד Firestore שאליו מצביע webhook ווטסאפ (ללא אתחול admin).
 * אותה לוגיקה כמו {@link getFirestoreForWhatsAppWebhook}.
 */
export function getWhatsAppWebhookDatabaseId(): string {
  const explicit = process.env.WHATSAPP_WEBHOOK_FIRESTORE_DATABASE_ID?.trim();
  if (explicit) return explicit;
  return fallbackTenantDatabaseId();
}

/**
 * מסד Firestore להודעות WhatsApp מ-webhook של מטא.
 * בקשות ממטא אין בהן עוגיית tenant — לכן לא משתמשים ב-headers() של הדפדפן.
 * הגדירו WHATSAPP_WEBHOOK_FIRESTORE_DATABASE_ID ב-Vercel (אותו databaseId כמו ב-CRM_TENANTS / FIRESTORE_DATABASE_ID)
 * אם הנתונים לא ב-(default).
 */
export function getFirestoreForWhatsAppWebhook(): admin.firestore.Firestore {
  ensureAdmin();
  return getFirestoreForDatabaseId(getWhatsAppWebhookDatabaseId());
}

let cachedResolvedStorageBucket: ReturnType<admin.storage.Storage["bucket"]> | undefined;

/**
 * בוחר בקט Storage קיים (בודק רשימת מועמדים כולל project.appspot.com ו-project.firebasestorage.app).
 * מונע 404 כשמשתנה הסביבה מצביע על בקט שלא קיים בפרויקט.
 */
export async function getAdminStorageBucketAsync(): Promise<
  ReturnType<admin.storage.Storage["bucket"]>
> {
  ensureAdmin();
  if (cachedResolvedStorageBucket) return cachedResolvedStorageBucket;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON");
  const cred = parseServiceAccountJson(raw);
  const pid = typeof cred.project_id === "string" ? cred.project_id : null;

  const candidates: string[] = [];
  const push = (s?: string | null) => {
    const t = s?.trim();
    if (t && !candidates.includes(t)) candidates.push(t);
  };

  push(process.env.FIREBASE_STORAGE_BUCKET);
  push(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
  if (pid) {
    push(`${pid}.appspot.com`);
    push(`${pid}.firebasestorage.app`);
  }

  for (const name of candidates) {
    const b = admin.storage().bucket(name);
    try {
      const [exists] = await b.exists();
      if (exists) {
        cachedResolvedStorageBucket = b;
        return b;
      }
    } catch {
      /* try next candidate */
    }
  }

  try {
    const def = admin.storage().bucket();
    const [exists] = await def.exists();
    if (exists) {
      cachedResolvedStorageBucket = def;
      return def;
    }
  } catch {
    /* fall through */
  }

  const hint =
    pid != null
      ? `נסו למחוק או לעדכן את FIREBASE_STORAGE_BUCKET ב-Vercel (ב-Firebase Console > Storage מופיע שם הבקט — לעיתים ${pid}.firebasestorage.app במקום ...appspot.com).`
      : "בדקו ב-Firebase Console > Storage את שם הבקט והגדירו FIREBASE_STORAGE_BUCKET ב-Vercel.";

  throw new Error(`לא נמצא בקט אחסון תקף. ${hint}`);
}

/** @deprecated העדיפו getAdminStorageBucketAsync — שם בקט שגוי עלול להחזיר בקט שלא קיים */
export function getAdminStorageBucket(): ReturnType<admin.storage.Storage["bucket"]> {
  ensureAdmin();
  const name =
    process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
  if (name) return admin.storage().bucket(name);
  return admin.storage().bucket();
}

/** הודעת שגיאה קריאה במקום JSON גולמי מ-GCS */
export function formatFirebaseStorageClientError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/bucket does not exist|404/.test(raw) && /bucket|notFound/i.test(raw)) {
    return "שירות האחסון לא מוגדר נכון: שם הבקט בשרת (למשל ב-Vercel) לא תואם לבקט ב-Firebase. פתחו Firebase Console > Storage והעתיקו את שם הבקט המדויק ל-FIREBASE_STORAGE_BUCKET, או הסירו את המשתנה כדי שהמערכת תזהה את הבקט אוטומטית.";
  }
  if (raw.length > 280 && raw.includes('"error"')) {
    return "שגיאת אחסון — בדקו ש-FIREBASE_STORAGE_BUCKET ב-Vercel תואם לשם הבקט ב-Firebase Console > Storage.";
  }
  return raw.length > 400 ? raw.slice(0, 400) + "…" : raw;
}

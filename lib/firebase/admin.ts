import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { headers } from "next/headers";
import { TENANT_DB_HEADER, getTenantConfigs } from "@/lib/tenant/config";

let init = false;

function ensureAdmin() {
  if (init) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON");

  const cred = JSON.parse(raw) as Record<string, unknown>;
  if (typeof cred.private_key === "string") {
    cred.private_key = cred.private_key.replace(/\\n/g, "\n");
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(cred as admin.ServiceAccount),
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

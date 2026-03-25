import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

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

export function getAdminDb(): admin.firestore.Firestore {
  ensureAdmin();
  const dbId = process.env.FIRESTORE_DATABASE_ID?.trim();
  if (dbId) {
    return getFirestore(admin.app(), dbId);
  }
  return getFirestore();
}


import type { NextRequest } from "next/server";

/** Reads API key from ingest-compatible headers (matches /api/ingest/*). */
export function providedIngestApiKey(req: NextRequest): string | null {
  const direct = req.headers.get("x-api-key");
  if (direct?.trim()) return direct.trim();
  const legacy = req.headers.get("x-crm-api-key");
  if (legacy?.trim()) return legacy.trim();
  const authz = req.headers.get("authorization");
  if (authz?.startsWith("Bearer ")) return authz.slice(7).trim();
  return null;
}

export function isValidIngestApiKey(req: NextRequest): boolean {
  const expected = process.env.CRM_INGEST_API_KEY?.trim();
  if (!expected) return false;
  const got = providedIngestApiKey(req);
  return Boolean(got && got === expected);
}

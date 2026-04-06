/**
 * ייבוא הזדמנויות מ-CSV (ייצוא Powercouple / דומה) ל-CRM דרך ה-API.
 *
 * דרישות:
 * - להריץ מקומית מול ה-URL של הפריסה (או localhost).
 * - מפתח קליטה: CRM_INGEST_API_KEY או מפתח מ"הגדרות → API" באותו מסד.
 * - כותרת טננט: מזהה מסד Firestore של powercouple (כמו ב-Vercel / CRM_TENANTS).
 *
 * שימוש:
 *   node scripts/import-powercouple-opportunities.mjs ^
 *     --file "C:\Users\itay\Downloads\opportunities (7).csv" ^
 *     --baseUrl "https://YOUR-APP.vercel.app" ^
 *     --apiKey "YOUR_KEY" ^
 *     --databaseId "YOUR_POWERCOUPLE_DATABASE_ID"
 *
 * אופציונלי:
 *   --field-map path\to\field-map.json   מיפוי שדות מותאמים (ראה דוגמה למטה)
 *   --pipeline-id ID                      מזהה מסמך pipelines ב-Firestore של הטננט (דורס את עמודת CSV)
 *   --pipeline-map path\to.json          מיפוי מזהה ייצוא (Powercouple) → מזהה אמיתי ב-CRM, לדוגמה:
 *                                         {"5gMLGwMLQVpe9pE7mr7A":"המזהה_מפיירסטור"}
 *   --dry-run                             רק ספירת שורות ודוגמה למיפוי
 *   --limit 50                            מגביל מספר רשומות
 *   --offset 100                          דילוג על רשומות ראשונות
 *   --delay-ms 80                         השהיה בין שורות (ברירת מחדל 80)
 *   --no-split-notes                     פתק אחד לכל שורה (ללא פיצול לפי "ליד השאיר פרטים מחדש:")
 *
 * Vercel: CRM_HISTORICAL_IMPORT_TENANT_DATABASE_IDS=powercouple — בלי זה שרת מתעלם מ-createdAt/updatedAt בקליטה.
 *
 * הערה: עמודת "Pipeline ID" בייצוא Powercouple אינה בהכרח מזהה המסמך ב-CRM. בלי --pipeline-id / --pipeline-map
 * תקבל "Pipeline not found" — אנשי קשר ייווצרו, הזדמנות ופתקים לא.
 *
 * שדות מותאמים: ב-CRM נשמרים רק fieldId שקיימים ב-customFields. הוסף field-map:
 *   { "contact": { "תזלקוח": "contact_tz" }, "opportunity": { "מוצר לרכישה": "opportunity_product" } }
 *
 * תאריכים: "Created on" / "Updated on" נשלחים לשרת רק אם ב-Vercel הוגדר CRM_HISTORICAL_IMPORT_TENANT_DATABASE_IDS (למשל powercouple).
 * פתקים: Notes מפוצל לפי "ליד השאיר פרטים מחדש:"; בכל קטע — תאריך משורת "תאריך: dd/mm/yyyy" (האחרון בקטע) או Created on.
 *
 * הגבלה ידועה: ב-CRM קיימת הזדמנות אחת לכל זיווג (איש קשר + פייפליין). אם ב-CSV יש שתי
 * הזדמנויות לאותו איש קשר באותו pipeline — השורה השנייה תתמזג לתוך אותה הזדמנות.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const EXTERNAL_PROVIDER = "powercouple-csv";

/** @param {string} content */
function parseCsv(content) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && content[i + 1] === "\n") i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else {
      cur += c;
    }
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

function trimKey(h) {
  return String(h ?? "").replace(/^\uFEFF/, "").trim();
}

function parseArgs() {
  const out = {
    file: "",
    baseUrl: process.env.CRM_BASE_URL ?? "",
    apiKey: process.env.CRM_IMPORT_API_KEY ?? process.env.CRM_INGEST_API_KEY ?? "",
    databaseId: process.env.CRM_TENANT_DATABASE_ID ?? "",
    fieldMapPath: "",
    /** @type {string | null} */
    pipelineIdOverride: null,
    /** @type {Record<string, string>} */
    pipelineMap: {},
    dryRun: false,
    limit: Infinity,
    offset: 0,
    delayMs: 80,
    noSplitNotes: false,
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--file" && next) {
      out.file = next;
      i++;
    } else if (a === "--baseUrl" && next) {
      out.baseUrl = next.replace(/\/$/, "");
      i++;
    } else if (a === "--apiKey" && next) {
      out.apiKey = next;
      i++;
    } else if (a === "--databaseId" && next) {
      out.databaseId = next;
      i++;
    } else if (a === "--field-map" && next) {
      out.fieldMapPath = next;
      i++;
    } else if (a === "--pipeline-id" && next) {
      out.pipelineIdOverride = next.trim();
      i++;
    } else if (a === "--pipeline-map" && next) {
      const txt = fs.readFileSync(path.resolve(next), "utf8");
      out.pipelineMap = JSON.parse(txt);
      i++;
    } else if (a === "--dry-run") {
      out.dryRun = true;
    } else if (a === "--limit" && next) {
      out.limit = Number(next);
      i++;
    } else if (a === "--offset" && next) {
      out.offset = Number(next);
      i++;
    } else if (a === "--delay-ms" && next) {
      out.delayMs = Number(next);
      i++;
    } else if (a === "--no-split-notes") {
      out.noSplitNotes = true;
    }
  }
  return out;
}

/** אחרון תאריך: בתוך "תאריך: dd/mm/yyyy [HH:mm]" (ייצוא Powercouple) */
function lastHebrewDateLineToIso(segment) {
  const re = /תאריך:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/gi;
  let m;
  let last = null;
  while ((m = re.exec(segment)) !== null) last = m;
  if (!last) return null;
  const day = Number.parseInt(last[1], 10);
  const month = Number.parseInt(last[2], 10) - 1;
  const year = Number.parseInt(last[3], 10);
  const hh = last[4] != null ? Number.parseInt(last[4], 10) : 12;
  const mm = last[5] != null ? Number.parseInt(last[5], 10) : 0;
  const d = new Date(year, month, day, hh, mm, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * מפצל את בלוב ה-Notes לפי "ליד השאיר פרטים מחדש:" ולכל קטע משייך תאריך משורת תאריך (או fallback מהשורה).
 * @param {string} blob
 * @param {string} [fallbackIso] מתוך "Created on" בשורת CSV
 * @param {boolean} noSplit
 */
function noteEntriesFromPowercoupleBlob(blob, fallbackIso, noSplit) {
  const raw = String(blob ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!raw) return [];
  const fallback =
    fallbackIso && !Number.isNaN(Date.parse(fallbackIso)) ? fallbackIso : undefined;
  if (noSplit) {
    return [{ text: raw, createdAt: fallback }];
  }
  const parts = raw.split(/\nליד השאיר פרטים מחדש:\s*\n/gi);
  const segments = parts.map((p) => p.trim()).filter(Boolean);
  const toProcess = segments.length ? segments : [raw];
  return toProcess.map((seg) => {
    const fromLine = lastHebrewDateLineToIso(seg);
    return {
      text: seg,
      createdAt: fromLine ?? fallback,
    };
  });
}

function mapStatus(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "open" || s === "פתוח") return "פתוח";
  if (s === "won" || s === "זכיה") return "זכיה";
  if (s === "lost" || s === "הפסד") return "הפסד";
  return "פתוח";
}

function numOrUndef(v) {
  if (v === undefined || v === null || String(v).trim() === "") return undefined;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : undefined;
}

/**
 * @param {Record<string, string>} row
 * @param {Record<string, Record<string, string>>} fieldMap
 */
function pickCustom(row, headers, entity, fieldMap) {
  const map = fieldMap[entity] ?? {};
  const out = {};
  for (const [csvCol, fieldId] of Object.entries(map)) {
    const key = headers.includes(csvCol) ? csvCol : headers.find((h) => trimKey(h) === trimKey(csvCol));
    if (!key) continue;
    const val = row[key];
    if (val !== undefined && String(val).trim() !== "") {
      out[fieldId] = String(val).trim();
    }
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {string} fromCsv
 * @param {string | null} override
 * @param {Record<string, string>} pipelineMap
 */
function resolvePipelineId(fromCsv, override, pipelineMap) {
  const raw = trimKey(fromCsv);
  if (override) return override;
  const mapped = pipelineMap[raw];
  if (mapped && String(mapped).trim()) return String(mapped).trim();
  return raw;
}

async function main() {
  const args = parseArgs();
  if (!args.file) {
    console.error("חובה: --file path/to.csv");
    process.exit(1);
  }
  if (!args.dryRun) {
    if (!args.baseUrl || !args.apiKey || !args.databaseId) {
      console.error("חובה: --baseUrl, --apiKey, --databaseId (או משתני סביבה CRM_BASE_URL / CRM_IMPORT_API_KEY / CRM_TENANT_DATABASE_ID)");
      process.exit(1);
    }
  }

  let fieldMap = { contact: {}, opportunity: {} };
  if (args.fieldMapPath && fs.existsSync(args.fieldMapPath)) {
    fieldMap = JSON.parse(fs.readFileSync(args.fieldMapPath, "utf8"));
  }

  const raw = fs.readFileSync(path.resolve(args.file), "utf8");
  const matrix = parseCsv(raw);
  if (matrix.length < 2) {
    console.error("CSV ריק או ללא נתונים");
    process.exit(1);
  }

  const headerRow = matrix[0].map(trimKey);
  const headerSet = new Set(headerRow);

  /** עמודות CSV → שדות CRM (תיעוד למפה) */
  const columnDoc = {
    "Opportunity Name": "שם הזדמנות → opportunity.name",
    "Contact Name": "שם איש קשר → contact.name",
    phone: "טלפון → contact.phone, opportunity.phone",
    email: "מייל → contact.email, opportunity.email",
    pipeline: "שם פייפליין (מידע בלבד; בשימוש יש לקחת מזהה מ-pipeline)",
    stage: "שם שלב (חייב להתאים בדיוק לשלבים במסמך ה-pipeline ב-CRM)",
    "Lead Value": "ערך עסקה → opportunity.value",
    source: "מקור → contact.source",
    assigned: "אחראי → assignedRep (איש קשר + הזדמנות)",
    "Pipeline ID": "מזהה בייצוא (לרוב Powercouple) — חייב מיפוי ל-id אמיתי ב-CRM (--pipeline-id / --pipeline-map)",
    "Contact ID": "מזהה חיצוני ל-contact-upsert (externalId)",
    "Opportunity ID": "מזהה חיצוני ל-opportunity-upsert (externalId)",
    status: 'סטטוס ייעודי (open → "פתוח")',
    tags: "טקסט תגית; נשלף ל-tags (מפרט פסיקים אם יש)",
    "landing page": "דף נחיתה → landingpage",
    landingpage: "מקור נוסף לשדה landingpage",
    utm_source: "utmSource",
    utm_campaign: "utmCampaign",
    utm_medium: "utmMedium",
    utm_content: "utmContent",
    Notes: "נכנס כפתק יחיד על ההזדמנות (מסונכרן לאיש קשר)",
    "Created on": "תאריך יצירה לאיש קשר, להזדמנות ולפתק (כשהפורמט תקין)",
    "Updated on": "תאריך עדכון אחרון לאיש קשר ולהזדמנות",
    "שם מלא ": 'אופציונלי לשדה מותאם דרך field-map (למשל אם יצרת fieldId)',
    תזלקוח: "שדה מותאם איש קשר — דרוש field-map",
    "כתובת מגורים": "שדה מותאם — דרוש field-map",
    "סטטוס נוסף": "שדה מותאם — דרוש field-map",
    "מוצר לרכישה": "שדה מותאם הזדמנות — דרוש field-map",
    "לינק לתשלום": "שדה מותאם הזדמנות — דרוש field-map",
  };

  console.log("— מיפוי עמודות (תקציר) —");
  for (const [col, desc] of Object.entries(columnDoc)) {
    const found = headerSet.has(col) || headerRow.some((h) => trimKey(h) === trimKey(col));
    if (found) console.log(`  [${col}] → ${desc}`);
  }

  const records = matrix.slice(1).filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  console.log(`\nסה"כ רשומות בקובץ (אחרי שורת כותרות): ${records.length}`);

  if (args.dryRun) {
    console.log("\n--dry-run: לא נשלחו בקשות.");
    if (records[0]) {
      const obj = Object.fromEntries(headerRow.map((h, i) => [h, records[0][i] ?? ""]));
      console.log("\nדוגמת שורה ראשונה (מפתחות מקוצרים):");
      const csvPipe = trimKey(obj["Pipeline ID"] ?? "");
      const resolved = resolvePipelineId(
        csvPipe,
        args.pipelineIdOverride,
        args.pipelineMap
      );
      console.log({
        opportunityName: obj["Opportunity Name"],
        contactId: obj["Contact ID"],
        opportunityId: obj["Opportunity ID"],
        pipelineIdFromCsv: csvPipe,
        pipelineIdEffective: resolved,
        stage: obj.stage,
        email: obj.email,
        phone: obj.phone?.slice?.(0, 12),
      });
      if (csvPipe && csvPipe === resolved && !args.pipelineIdOverride && !Object.keys(args.pipelineMap).length) {
        console.warn(
          "\n⚠ אם pipelineIdFromCsv אינו מזהה מסמך בקולקציה pipelines ב-Firestore של הטננט — הוסף --pipeline-id או --pipeline-map"
        );
      }
    }
    process.exit(0);
  }

  const headers = headerRow;
  let done = 0;
  let errors = 0;
  const start = args.offset;
  const end = Math.min(records.length, start + args.limit);

  for (let idx = start; idx < end; idx++) {
    const values = records[idx];
    /** @type {Record<string, string>} */
    const row = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? "";
    });

    const contactExt = trimKey(row["Contact ID"] ?? "");
    const oppExt = trimKey(row["Opportunity ID"] ?? "");
    const pipelineIdCsv = trimKey(row["Pipeline ID"] ?? "");
    const pipelineId = resolvePipelineId(
      pipelineIdCsv,
      args.pipelineIdOverride,
      args.pipelineMap
    );
    const email = trimKey(row.email ?? "");
    const phone = trimKey(row.phone ?? "");

    if (!contactExt || !oppExt || !pipelineId) {
      console.warn(
        `שורה ${idx + 2}: חסר Contact ID / Opportunity ID או Pipeline (אחרי מיפוי; בדוק --pipeline-id / עמודת CSV) — דילוג`
      );
      errors++;
      continue;
    }
    if (!email && !phone) {
      console.warn(`שורה ${idx + 2}: חסר email וטלפון — דילוג`);
      errors++;
      continue;
    }

    const createdOn = trimKey(row["Created on"] ?? "");
    const updatedOn = trimKey(row["Updated on"] ?? "");
    const contactPayload = {
      provider: EXTERNAL_PROVIDER,
      externalId: contactExt,
      contact: {
        email: email || undefined,
        phone: phone || undefined,
        name: trimKey(row["Contact Name"] ?? row["Opportunity Name"] ?? ""),
        source: trimKey(row.source ?? "") || "powercouple-import",
        assignedRep: trimKey(row.assigned ?? "") || undefined,
        pipelineId: pipelineId || undefined,
        ...(createdOn && !Number.isNaN(Date.parse(createdOn)) ? { createdAt: createdOn } : {}),
        ...(updatedOn && !Number.isNaN(Date.parse(updatedOn)) ? { updatedAt: updatedOn } : {}),
        ...pickCustom(row, headers, "contact", fieldMap),
      },
    };

    try {
      const cr = await fetch(`${args.baseUrl}/api/ingest/contact-upsert`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-crm-tenant-database-id": args.databaseId,
          "x-api-key": args.apiKey,
        },
        body: JSON.stringify(contactPayload),
      });
      const cj = await cr.json();
      if (!cr.ok || !cj.ok) {
        throw new Error(cj.error ?? cr.statusText);
      }
      const contactId = cj.contact?.id;
      if (!contactId) throw new Error("אין contact.id בתשובה");

      const tagsRaw = trimKey(row.tags ?? "");
      const tags = tagsRaw
        ? tagsRaw
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined;

      const oppPayload = {
        provider: EXTERNAL_PROVIDER,
        externalId: oppExt,
        opportunity: {
          name: trimKey(row["Opportunity Name"] ?? "") || undefined,
          contactId,
          pipelineId,
          stage: trimKey(row.stage ?? "") || undefined,
          status: mapStatus(row.status),
          value: numOrUndef(row["Lead Value"]),
          email: email || undefined,
          phone: phone || undefined,
          utmSource: trimKey(row.utm_source ?? "") || undefined,
          utmCampaign: trimKey(row.utm_campaign ?? "") || undefined,
          utmMedium: trimKey(row.utm_medium ?? "") || undefined,
          utmContent: trimKey(row.utm_content ?? "") || undefined,
          landingpage:
            trimKey(row["landing page"] ?? "") || trimKey(row.landingpage ?? "") || undefined,
          assignedRep: trimKey(row.assigned ?? "") || undefined,
          skipInitialAutoNote: true,
          ...(createdOn && !Number.isNaN(Date.parse(createdOn)) ? { createdAt: createdOn } : {}),
          ...(updatedOn && !Number.isNaN(Date.parse(updatedOn)) ? { updatedAt: updatedOn } : {}),
          ...(tags?.length ? { tags } : {}),
          ...pickCustom(row, headers, "opportunity", fieldMap),
        },
      };

      const or = await fetch(`${args.baseUrl}/api/ingest/opportunity-upsert`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-crm-tenant-database-id": args.databaseId,
          "x-api-key": args.apiKey,
        },
        body: JSON.stringify(oppPayload),
      });
      const oj = await or.json();
      if (!or.ok || !oj.ok) {
        throw new Error(oj.error ?? or.statusText);
      }
      const opportunityId = oj.opportunity?.id;
      if (!opportunityId) throw new Error("אין opportunity.id בתשובה");

      const rawNotes = trimKey(row.Notes ?? "");
      if (rawNotes) {
        let entries = noteEntriesFromPowercoupleBlob(rawNotes, createdOn, args.noSplitNotes)
          .map((e, i) => ({ ...e, _i: i }))
          .filter((e) => e.text.trim());
        entries.sort((a, b) => {
          const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
          const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
          if (ta !== tb) return ta - tb;
          return a._i - b._i;
        });
        for (const e of entries) {
          const nr = await fetch(
            `${args.baseUrl}/api/opportunities/${encodeURIComponent(opportunityId)}/notes`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-crm-tenant-database-id": args.databaseId,
                "x-api-key": args.apiKey,
              },
              body: JSON.stringify({
                id: `powercouple-import:${oppExt}:n${e._i}`,
                text: e.text,
                createdBy: "ייבוא Powercouple",
                ...(e.createdAt ? { createdAt: e.createdAt } : {}),
              }),
            }
          );
          const nj = await nr.json();
          if (!nr.ok || !nj.ok) {
            throw new Error(nj.error ?? nr.statusText);
          }
        }
      }

      done++;
      if (done % 25 === 0) console.log(`... יובאו ${done} רשומות (שורות עד ${idx + 2})`);
    } catch (e) {
      errors++;
      console.error(`שורה ${idx + 2}:`, e instanceof Error ? e.message : e);
    }

    if (args.delayMs > 0) await sleep(args.delayMs);
  }

  console.log(`\nסיום. יובאו בהצלחה: ${done}, שגיאות/דילוגים: ${errors}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

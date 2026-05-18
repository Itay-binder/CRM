import Anthropic from "@anthropic-ai/sdk";
import type { OrderMatchUiHints, MovingOrderPayload } from "@/lib/movingOrders/types";

export type NotesConflictPair = {
  orderId: string;
  driverId: string;
  moverNotes: string;
  orderSummary: string;
};

const SYSTEM_PROMPT = `אתה מנוע התאמה של מערכת הובלות. תפקידך לזהות האם הערות שנרשמו על מוביל מגלות **במפורש** אי-התאמה עם פרטי הזמנה נתונה.

ענה אך ורק ב-JSON בפורמט הבא (ללא שום טקסט נוסף):
{"conflicts": ["orderId::driverId", ...]}

**כלל מרכזי**: הוסף זוג ל-conflicts רק אם ההערות אומרות בפירוש שהזמנה זו לא מתאימה למוביל.
דוגמאות לסתירה אמיתית:
- "לא עושה צפון" + הזמנה מהצפון
- "עובד רק ג'-ה'" + הזמנה ביום ראשון
- "לא עושה הובלות קטנות" + הזמנת עמוד
- "לא עושה מנוף" + הזמנה עם מנוף
- "מצפון לדרום בלבד" + הזמנה מדרום לצפון
- "עד סוף החודש בחופשה" + הזמנה השבוע

**אל תסמן** סתירה אם: ההערות כלליות ולא ספציפיות, ההזמנה תואמת לקריטריון, או אין קשר ברור בין ההערה לפרטי ההזמנה.`;

export function buildOrderSummary(
  payload: MovingOrderPayload,
  hints: OrderMatchUiHints | undefined
): string {
  const parts: string[] = [];
  const pickup = hints?.pickupCity || payload.pickup_city || payload.pickup || "";
  const drop = hints?.dropCity || payload.dropoff_city || payload.dropoff || "";
  if (pickup || drop) parts.push(`מסלול: ${pickup || "?"} → ${drop || "?"}`);
  if (hints?.moveWeekdayHe) parts.push(`יום: ${hints.moveWeekdayHe}`);
  if (payload.move_type) parts.push(`סוג: ${payload.move_type}`);
  if (payload.is_urgent === "true" || payload.is_urgent === "1" || payload.is_urgent === "yes")
    parts.push("דחוף");
  const craneNeeded =
    payload.needs_crane === "true" ||
    payload.needs_crane === "1" ||
    payload.needs_crane === "yes" ||
    (!!payload.crane_info && payload.crane_info !== "false" && payload.crane_info !== "0");
  if (craneNeeded) parts.push("דורש מנוף");
  if (payload.what_moving) parts.push(`מה מובל: ${payload.what_moving}`);
  return parts.join(" | ") || "הזמנת הובלה";
}

export async function analyzeNotesConflicts(
  pairs: NotesConflictPair[]
): Promise<Set<string>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || pairs.length === 0) return new Set();

  try {
    const client = new Anthropic({ apiKey });

    const userText = pairs
      .map(
        (p) =>
          `[${p.orderId}::${p.driverId}]\nהערות מוביל: ${p.moverNotes}\nפרטי הזמנה: ${p.orderSummary}`
      )
      .join("\n\n---\n\n");

    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userText }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock && "text" in textBlock ? textBlock.text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return new Set();
    const parsed = JSON.parse(match[0]) as { conflicts?: unknown };
    if (!Array.isArray(parsed.conflicts)) return new Set();
    return new Set(parsed.conflicts.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

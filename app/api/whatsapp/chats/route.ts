import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  getWhatsAppChatThread,
  listWhatsAppChatThreads,
  markWhatsAppChatThreadRead,
} from "@/lib/whatsapp/repo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  try {
    const db = await getAdminDb();
    const threadId = req.nextUrl.searchParams.get("thread")?.trim() ?? "";
    /** ריענון שיחה בלבד — בלי listWhatsAppChatThreads (חוסך קריאת רשימה מלאה בכל פול). */
    if (threadId) {
      const thread = await getWhatsAppChatThread(db, threadId);
      if (!thread) {
        return NextResponse.json({ ok: false, error: "Chat thread not found" }, { status: 404 });
      }
      await markWhatsAppChatThreadRead(db, threadId);
      return NextResponse.json({ ok: true, thread: { ...thread, unreadCount: 0 } });
    }
    const threads = await listWhatsAppChatThreads(db, 120);
    return NextResponse.json({ ok: true, threads });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createUnavailableEvent,
  mirrorUnavailableToAllCalendar,
} from "@/lib/google-calendar";

// POST /api/actors/[id]/sync-unavailable - 배우별 미동기화 불가일정 동기화
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const actor = await prisma.actor.findUnique({ where: { id } });
  if (!actor) {
    return NextResponse.json({ error: "배우를 찾을 수 없습니다" }, { status: 404 });
  }
  if (!actor.calendarId) {
    return NextResponse.json({ error: "캘린더가 연결되지 않은 배우입니다" }, { status: 400 });
  }

  const unsynced = await prisma.unavailableDate.findMany({
    where: { actorId: id, synced: false },
    include: { performanceDate: true },
  });

  let synced = 0;
  let failed = 0;

  for (const item of unsynced) {
    const dateStr = item.performanceDate.date.toISOString().split("T")[0];
    const eventId = await createUnavailableEvent(actor.calendarId!, actor.name, dateStr, item.performanceDate.startTime, item.performanceDate.endTime);

    if (eventId) {
      let allEventId: string | null = null;
      try {
        allEventId = await mirrorUnavailableToAllCalendar(actor.name, dateStr, item.performanceDate.startTime, item.performanceDate.endTime);
      } catch {}

      await prisma.unavailableDate.update({
        where: { id: item.id },
        data: { synced: true, calendarEventId: eventId, allCalendarEventId: allEventId },
      });
      synced++;
    } else {
      failed++;
    }
  }

  return NextResponse.json({ synced, failed, total: unsynced.length });
}

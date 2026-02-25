import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createUnavailableEvent,
  deleteCalendarEvent,
  createCastingEvent,
} from "@/lib/google-calendar";
import { buildReservationDescription } from "@/lib/schedule";

// POST /api/calendar/sync - 전체 동기화 (관리자 전용)
export async function POST() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results = { unavailable: { synced: 0, failed: 0 }, casting: { synced: 0, failed: 0 } };

  // 1. 미동기화 불가일정 동기화
  const unsyncedUnavailable = await prisma.unavailableDate.findMany({
    where: { synced: false },
    include: { actor: true, performanceDate: true },
  });

  for (const item of unsyncedUnavailable) {
    if (!item.actor.calendarId) continue;

    const dateStr = item.performanceDate.date.toISOString().split("T")[0];
    const eventId = await createUnavailableEvent(
      item.actor.calendarId,
      item.actor.name,
      dateStr
    );

    if (eventId) {
      await prisma.unavailableDate.update({
        where: { id: item.id },
        data: { synced: true, calendarEventId: eventId },
      });
      results.unavailable.synced++;
    } else {
      results.unavailable.failed++;
    }
  }

  // 2. 미동기화 배역 배정 동기화
  const unsyncedCastings = await prisma.casting.findMany({
    where: { synced: false },
    include: {
      actor: { include: { user: true } },
      performanceDate: true,
    },
  });

  // MALE_LEAD 캐스팅의 ReservationStatus 메모 일괄 조회
  const malePerfDateIds = unsyncedCastings
    .filter((c) => c.roleType === "MALE_LEAD")
    .map((c) => c.performanceDateId);
  const resMemos = malePerfDateIds.length > 0
    ? await prisma.reservationStatus.findMany({
        where: { performanceDateId: { in: malePerfDateIds } },
        select: { performanceDateId: true, reservationName: true, reservationContact: true },
      })
    : [];
  const resMemoMap = new Map(resMemos.map((m) => [m.performanceDateId, m]));

  for (const casting of unsyncedCastings) {
    const dateStr = casting.performanceDate.date.toISOString().split("T")[0];

    // 기존 이벤트가 있으면 삭제 (취소 알림 발송)
    if (casting.calendarEventId) {
      const calendarId =
        casting.actor.calendarId ||
        (casting.roleType === "MALE_LEAD"
          ? process.env.CALENDAR_MALE_LEAD
          : process.env.CALENDAR_FEMALE_LEAD);
      if (calendarId) {
        await deleteCalendarEvent(calendarId, casting.calendarEventId, true);
      }
    }

    // MALE_LEAD인 경우 ReservationStatus 메모로 description 생성
    let description: string | undefined;
    if (casting.roleType === "MALE_LEAD") {
      const memo = resMemoMap.get(casting.performanceDateId);
      if (memo?.reservationName && memo?.reservationContact) {
        description = buildReservationDescription(memo.reservationName, memo.reservationContact);
      }
    }

    const eventId = await createCastingEvent(
      casting.roleType,
      casting.actor.name,
      dateStr,
      casting.performanceDate.startTime,
      casting.performanceDate.endTime,
      casting.performanceDate.label,
      casting.actor.calendarId,
      description
    );

    if (eventId) {
      await prisma.casting.update({
        where: { id: casting.id },
        data: { synced: true, calendarEventId: eventId },
      });
      results.casting.synced++;
    } else {
      results.casting.failed++;
    }
  }

  return NextResponse.json({
    message: "동기화 완료",
    results,
  });
}

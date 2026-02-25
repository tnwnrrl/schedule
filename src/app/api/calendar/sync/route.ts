import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createUnavailableEvent,
  deleteCalendarEvent,
  createCastingEvent,
  mirrorCastingToAllCalendar,
  mirrorUnavailableToAllCalendar,
  deleteFromAllCalendar,
} from "@/lib/google-calendar";
import { buildCastingDescription } from "@/lib/schedule";

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
      // 전체배우일정 캘린더에도 미러링
      let allEventId: string | null = null;
      try {
        allEventId = await mirrorUnavailableToAllCalendar(item.actor.name, dateStr);
      } catch {}

      await prisma.unavailableDate.update({
        where: { id: item.id },
        data: { synced: true, calendarEventId: eventId, allCalendarEventId: allEventId },
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

  const kstToday = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().split("T")[0];

  // MALE_LEAD의 상대역(FEMALE_LEAD) 이름 일괄 조회
  const maleCastingPerfDateIds = unsyncedCastings
    .filter((c) => c.roleType === "MALE_LEAD")
    .map((c) => c.performanceDateId);
  const femaleCastings = maleCastingPerfDateIds.length > 0
    ? await prisma.casting.findMany({
        where: { performanceDateId: { in: maleCastingPerfDateIds }, roleType: "FEMALE_LEAD" },
        include: { actor: { select: { name: true } } },
      })
    : [];
  const partnerNameMap = new Map(femaleCastings.map((c) => [c.performanceDateId, c.actor.name]));

  // 당일 MALE_LEAD의 예약 메모 조회
  const todayMalePerfDateIds = maleCastingPerfDateIds.filter((id) => {
    const c = unsyncedCastings.find((uc) => uc.performanceDateId === id && uc.roleType === "MALE_LEAD");
    return c && c.performanceDate.date.toISOString().split("T")[0] === kstToday;
  });
  const resMemos = todayMalePerfDateIds.length > 0
    ? await prisma.reservationStatus.findMany({
        where: { performanceDateId: { in: todayMalePerfDateIds } },
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
    if (casting.allCalendarEventId) {
      await deleteFromAllCalendar(casting.allCalendarEventId).catch(() => {});
    }

    // MALE_LEAD: 상대역(항상) + 예약메모(당일만)
    let description: string | undefined;
    if (casting.roleType === "MALE_LEAD") {
      const partnerName = partnerNameMap.get(casting.performanceDateId);
      let resName: string | null | undefined;
      let resContact: string | null | undefined;
      if (dateStr === kstToday) {
        const memo = resMemoMap.get(casting.performanceDateId);
        resName = memo?.reservationName;
        resContact = memo?.reservationContact;
      }
      description = buildCastingDescription({ partnerName, reservationName: resName, reservationContact: resContact });
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
      // 전체배우일정 캘린더에도 미러링
      let allEventId: string | null = null;
      try {
        allEventId = await mirrorCastingToAllCalendar(
          casting.roleType,
          casting.actor.name,
          dateStr,
          casting.performanceDate.startTime,
          casting.performanceDate.endTime,
          casting.performanceDate.label,
          description
        );
      } catch {}

      await prisma.casting.update({
        where: { id: casting.id },
        data: { synced: true, calendarEventId: eventId, allCalendarEventId: allEventId },
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

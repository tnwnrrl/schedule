import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateEventDescription } from "@/lib/google-calendar";

// GET /api/cron/cleanup-memos - 과거 공연 메모 자동 정리 (Vercel Cron)
export async function GET(req: NextRequest) {
  // Vercel Cron 인증 (CRON_SECRET)
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // KST 기준 오늘 00:00 UTC (DB에 UTC midnight으로 저장되어 있으므로)
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const todayStr = kstNow.toISOString().split("T")[0];
  const today = new Date(todayStr + "T00:00:00Z");

  // 어제 이전 공연의 ReservationStatus 중 메모가 있는 것 조회
  const reservationsWithMemos = await prisma.reservationStatus.findMany({
    where: {
      performanceDate: {
        date: { lt: today },
      },
      OR: [
        { reservationName: { not: null } },
        { reservationContact: { not: null } },
      ],
    },
    include: {
      performanceDate: true,
    },
  });

  if (reservationsWithMemos.length === 0) {
    return NextResponse.json({ success: true, cleaned: 0 });
  }

  // 해당 회차의 MALE_LEAD 캐스팅 조회 (캘린더 이벤트 description 제거용)
  const perfDateIds = reservationsWithMemos.map((r) => r.performanceDateId);
  const maleCastings = await prisma.casting.findMany({
    where: {
      performanceDateId: { in: perfDateIds },
      roleType: "MALE_LEAD",
      calendarEventId: { not: null },
    },
    include: {
      actor: { select: { calendarId: true } },
    },
  });
  const castingByPerfDate = new Map(maleCastings.map((c) => [c.performanceDateId, c]));

  let cleaned = 0;
  let calendarUpdated = 0;

  for (const reservation of reservationsWithMemos) {
    // DB에서 메모 필드 null 처리
    await prisma.reservationStatus.update({
      where: { id: reservation.id },
      data: {
        reservationName: null,
        reservationContact: null,
      },
    });
    cleaned++;

    // Google Calendar 이벤트 description 제거
    const casting = castingByPerfDate.get(reservation.performanceDateId);
    if (casting?.calendarEventId) {
      const calendarId =
        casting.actor.calendarId || process.env.CALENDAR_MALE_LEAD;

      if (calendarId) {
        const updated = await updateEventDescription(
          calendarId,
          casting.calendarEventId,
          null
        ).catch(() => false);
        if (updated) calendarUpdated++;
      }
    }
  }

  return NextResponse.json({
    success: true,
    cleaned,
    calendarUpdated,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateEventDescription, updateAllCalendarDescription } from "@/lib/google-calendar";

// GET /api/cron/cleanup-future-descriptions
// 일회성: 미래 날짜 MALE_LEAD 캐스팅의 캘린더 description 제거
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const kstToday = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().split("T")[0];

  // 오늘 이후 MALE_LEAD 캐스팅 중 캘린더 이벤트가 있는 건 조회
  const futureCastings = await prisma.casting.findMany({
    where: {
      roleType: "MALE_LEAD",
      performanceDate: {
        date: { gt: new Date(kstToday) },
      },
      calendarEventId: { not: null },
    },
    include: {
      actor: { select: { calendarId: true } },
      performanceDate: { select: { date: true } },
    },
  });

  let cleaned = 0;
  let failed = 0;

  for (const casting of futureCastings) {
    // 배우 개인 캘린더 description 제거
    if (casting.calendarEventId) {
      const calendarId =
        casting.actor.calendarId || process.env.CALENDAR_MALE_LEAD;
      if (calendarId) {
        const ok = await updateEventDescription(calendarId, casting.calendarEventId, null);
        if (ok) cleaned++;
        else failed++;
      }
    }

    // 전체배우일정 캘린더 description 제거
    if (casting.allCalendarEventId) {
      await updateAllCalendarDescription(casting.allCalendarEventId, null).catch(() => {});
    }
  }

  return NextResponse.json({
    message: "미래 캐스팅 description 정리 완료",
    total: futureCastings.length,
    cleaned,
    failed,
  });
}

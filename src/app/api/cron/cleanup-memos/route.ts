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

  // 오늘 00:00 UTC 기준으로 어제까지의 공연 조회
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // 어제 이전 공연의 캐스팅 중 메모가 있는 것 조회
  const castingsWithMemos = await prisma.casting.findMany({
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
      actor: { select: { calendarId: true } },
    },
  });

  if (castingsWithMemos.length === 0) {
    return NextResponse.json({ success: true, cleaned: 0 });
  }

  let cleaned = 0;
  let calendarUpdated = 0;

  for (const casting of castingsWithMemos) {
    // DB에서 메모 필드 null 처리
    await prisma.casting.update({
      where: { id: casting.id },
      data: {
        reservationName: null,
        reservationContact: null,
      },
    });
    cleaned++;

    // Google Calendar 이벤트 description 제거
    if (casting.calendarEventId) {
      const calendarId =
        casting.actor.calendarId ||
        (casting.roleType === "MALE_LEAD"
          ? process.env.CALENDAR_MALE_LEAD
          : process.env.CALENDAR_FEMALE_LEAD);

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

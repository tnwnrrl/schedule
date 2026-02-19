import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createCastingEvent,
  deleteCalendarEvent,
} from "@/lib/google-calendar";

// POST /api/casting/notify - 알림 재발송 (기존 이벤트 삭제 → 재생성)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { castingIds } = body as { castingIds: string[] };

  if (!castingIds || !Array.isArray(castingIds) || castingIds.length === 0) {
    return NextResponse.json(
      { error: "castingIds 배열은 필수입니다" },
      { status: 400 }
    );
  }

  const castings = await prisma.casting.findMany({
    where: { id: { in: castingIds } },
    include: {
      actor: { include: { user: true } },
      performanceDate: true,
    },
  });

  if (castings.length === 0) {
    return NextResponse.json(
      { error: "해당 배정을 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const noEmailActors: string[] = [];
  const errors: string[] = [];

  for (const casting of castings) {
    const actorEmail = casting.actor.user?.email || null;
    if (!actorEmail) {
      skipped++;
      noEmailActors.push(casting.actor.name);
      continue;
    }

    try {
      // 기존 이벤트 삭제
      if (casting.calendarEventId) {
        const calendarId =
          casting.actor.calendarId ||
          (casting.roleType === "MALE_LEAD"
            ? process.env.CALENDAR_MALE_LEAD
            : process.env.CALENDAR_FEMALE_LEAD);
        if (calendarId) {
          await deleteCalendarEvent(calendarId, casting.calendarEventId, false);
        }
      }

      // 새 이벤트 생성 (초대 알림 발송)
      const dateStr = casting.performanceDate.date.toISOString().split("T")[0];
      const eventId = await createCastingEvent(
        casting.roleType,
        casting.actor.name,
        dateStr,
        casting.performanceDate.startTime,
        casting.performanceDate.endTime,
        casting.performanceDate.label,
        actorEmail,
        casting.actor.calendarId
      );

      if (eventId) {
        await prisma.casting.update({
          where: { id: casting.id },
          data: { synced: true, calendarEventId: eventId },
        });
        sent++;
      } else {
        const calId = casting.roleType === "MALE_LEAD"
          ? process.env.CALENDAR_MALE_LEAD
          : process.env.CALENDAR_FEMALE_LEAD;
        const hasSA = !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
        errors.push(`${casting.actor.name}: calendarId=${calId ? "OK" : "MISSING"}, SA=${hasSA ? "OK" : "MISSING"}`);
        failed++;
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      errors.push(`${casting.actor.name}: ${errMsg}`);
      failed++;
    }
  }

  // 메시지 구성
  const parts: string[] = [];
  if (sent > 0) parts.push(`${sent}건 발송 완료`);
  if (skipped > 0) {
    const uniqueNames = [...new Set(noEmailActors)];
    parts.push(`${uniqueNames.join(", ")} 계정 미연결`);
  }
  if (failed > 0) parts.push(`${failed}건 발송 실패`);
  const message = parts.join(", ") || "발송 대상 없음";

  return NextResponse.json({
    message,
    sent,
    skipped,
    failed,
    ...(errors.length > 0 && { errors }),
  });
}

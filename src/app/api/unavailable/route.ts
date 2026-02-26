import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  deleteCalendarEvent,
  deleteFromAllCalendar,
  updateEventDescription,
  updateAllCalendarDescription,
} from "@/lib/google-calendar";
import { buildCastingDescription } from "@/lib/schedule";

// GET /api/unavailable?actorId=xxx - 불가일정 조회
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const actorId = searchParams.get("actorId");

  const where = actorId ? { actorId } : {};

  const unavailableDates = await prisma.unavailableDate.findMany({
    where,
    include: {
      actor: { select: { name: true, roleType: true } },
      performanceDate: { select: { date: true, startTime: true } },
    },
    orderBy: { performanceDate: { date: "asc" } },
  });

  return NextResponse.json(unavailableDates);
}

// POST /api/unavailable - 불가일정 동기화 (추가/삭제)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { actorId, performanceDateIds } = body as {
    actorId: string;
    performanceDateIds: string[];
  };

  if (!actorId || !performanceDateIds || !Array.isArray(performanceDateIds)) {
    return NextResponse.json(
      { error: "actorId와 performanceDateIds 배열은 필수입니다" },
      { status: 400 }
    );
  }

  // 배우 본인만 수정 가능 (관리자는 모두 가능)
  if (session.user.role !== "ADMIN" && session.user.actorId !== actorId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 현재 불가일정 조회
  const existing = await prisma.unavailableDate.findMany({
    where: { actorId },
  });
  const existingIds = new Set(existing.map((u) => u.performanceDateId));
  const newIds = new Set(performanceDateIds);

  // 추가할 회차 (newIds에 있고 existing에 없는 것)
  const toAdd = performanceDateIds.filter((id) => !existingIds.has(id));

  // 삭제할 회차 (existing에 있고 newIds에 없는 것)
  const toRemove = existing.filter((u) => !newIds.has(u.performanceDateId));

  // 불가일정 추가 시 해당 회차의 기존 캐스팅 자동 삭제
  let conflictCastings: Array<{
    id: string;
    performanceDateId: string;
    roleType: string;
    calendarEventId: string | null;
    allCalendarEventId: string | null;
    actor: { calendarId: string | null };
  }> = [];
  if (toAdd.length > 0) {
    conflictCastings = await prisma.casting.findMany({
      where: { actorId, performanceDateId: { in: toAdd } },
      select: {
        id: true,
        performanceDateId: true,
        roleType: true,
        calendarEventId: true,
        allCalendarEventId: true,
        actor: { select: { calendarId: true } },
      },
    });
  }

  // 트랜잭션으로 일괄 처리 (불가일정 추가/삭제 + 충돌 캐스팅 삭제)
  await prisma.$transaction([
    ...toAdd.map((performanceDateId) =>
      prisma.unavailableDate.create({
        data: {
          actorId,
          performanceDateId,
        },
      })
    ),
    ...toRemove.map((u) =>
      prisma.unavailableDate.delete({
        where: { id: u.id },
      })
    ),
    ...conflictCastings.map((c) =>
      prisma.casting.delete({
        where: { id: c.id },
      })
    ),
  ]);

  // 충돌 캐스팅의 캘린더 이벤트 삭제 (트랜잭션 이후 비동기)
  for (const c of conflictCastings) {
    try {
      if (c.calendarEventId) {
        const calId =
          c.actor.calendarId ||
          (c.roleType === "MALE_LEAD"
            ? process.env.CALENDAR_MALE_LEAD
            : process.env.CALENDAR_FEMALE_LEAD);
        if (calId) {
          await deleteCalendarEvent(calId, c.calendarEventId, true);
        }
      }
      if (c.allCalendarEventId) {
        await deleteFromAllCalendar(c.allCalendarEventId);
      }
      // FEMALE_LEAD 캐스팅 삭제 시 MALE_LEAD description에서 상대역 제거
      if (c.roleType === "FEMALE_LEAD") {
        const maleCasting = await prisma.casting.findUnique({
          where: { performanceDateId_roleType: { performanceDateId: c.performanceDateId, roleType: "MALE_LEAD" } },
          include: { actor: { select: { calendarId: true } }, performanceDate: true },
        });
        if (maleCasting?.calendarEventId) {
          const desc = buildCastingDescription({});
          const calId = maleCasting.actor.calendarId || process.env.CALENDAR_MALE_LEAD;
          if (calId) {
            await updateEventDescription(calId, maleCasting.calendarEventId, desc || null);
          }
          if (maleCasting.allCalendarEventId) {
            await updateAllCalendarDescription(maleCasting.allCalendarEventId, desc || null);
          }
        }
      }
    } catch (e) {
      console.error("불가일정 추가 시 캐스팅 캘린더 이벤트 삭제 실패:", e);
    }
  }

  // 업데이트된 불가일정 반환
  const updated = await prisma.unavailableDate.findMany({
    where: { actorId },
    orderBy: { performanceDate: { date: "asc" } },
  });

  return NextResponse.json({
    unavailableDates: updated,
    removedCastings: conflictCastings.length,
  });
}

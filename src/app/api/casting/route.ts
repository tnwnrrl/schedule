import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createCastingEvent,
  deleteCalendarEvent,
} from "@/lib/google-calendar";

// GET /api/casting - 배역 배정 전체 조회
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const castings = await prisma.casting.findMany({
    include: {
      performanceDate: true,
      actor: { select: { id: true, name: true, roleType: true } },
    },
    orderBy: { performanceDate: { date: "asc" } },
  });

  return NextResponse.json(castings);
}

// POST /api/casting - 배역 배정/변경 (관리자 전용)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { performanceDateId, actorId, roleType } = body;

  if (!performanceDateId || !roleType) {
    return NextResponse.json(
      { error: "performanceDateId와 roleType은 필수입니다" },
      { status: 400 }
    );
  }

  if (!["MALE_LEAD", "FEMALE_LEAD"].includes(roleType)) {
    return NextResponse.json(
      { error: "roleType은 MALE_LEAD 또는 FEMALE_LEAD여야 합니다" },
      { status: 400 }
    );
  }

  // actorId가 null/빈값이면 배정 해제
  if (!actorId) {
    // 기존 캘린더 이벤트 삭제 (취소 알림 발송)
    const existing = await prisma.casting.findUnique({
      where: { performanceDateId_roleType: { performanceDateId, roleType } },
    });
    if (existing?.calendarEventId) {
      const calendarId =
        roleType === "MALE_LEAD"
          ? process.env.CALENDAR_MALE_LEAD
          : process.env.CALENDAR_FEMALE_LEAD;
      if (calendarId) {
        try {
          await deleteCalendarEvent(calendarId, existing.calendarEventId, true);
        } catch (e) {
          console.error("배정 해제 캘린더 이벤트 삭제 실패:", e);
        }
      }
    }

    await prisma.casting.deleteMany({
      where: { performanceDateId, roleType },
    });
    return NextResponse.json({ success: true, action: "removed" });
  }

  // 배우, 공연일, 불가일정을 병렬 조회
  const [actor, perfDate, unavailable] = await Promise.all([
    prisma.actor.findUnique({ where: { id: actorId }, include: { user: true } }),
    prisma.performanceDate.findUnique({ where: { id: performanceDateId } }),
    prisma.unavailableDate.findFirst({ where: { actorId, performanceDateId } }),
  ]);

  if (!actor) {
    return NextResponse.json(
      { error: "배우를 찾을 수 없습니다" },
      { status: 404 }
    );
  }
  if (actor.roleType !== roleType) {
    return NextResponse.json(
      { error: "배우의 역할 타입이 일치하지 않습니다" },
      { status: 400 }
    );
  }
  if (!perfDate) {
    return NextResponse.json(
      { error: "공연일을 찾을 수 없습니다" },
      { status: 404 }
    );
  }
  if (unavailable) {
    return NextResponse.json(
      { error: "해당 배우는 이 회차에 불가일정이 등록되어 있습니다" },
      { status: 400 }
    );
  }

  // 기존 배정의 캘린더 이벤트 삭제 (배우 변경 시 취소 알림)
  const existingCasting = await prisma.casting.findUnique({
    where: { performanceDateId_roleType: { performanceDateId, roleType } },
  });
  if (existingCasting?.calendarEventId) {
    const calId =
      roleType === "MALE_LEAD"
        ? process.env.CALENDAR_MALE_LEAD
        : process.env.CALENDAR_FEMALE_LEAD;
    if (calId) {
      try {
        await deleteCalendarEvent(calId, existingCasting.calendarEventId, true);
      } catch (e) {
        console.error("기존 캘린더 이벤트 삭제 실패:", e);
      }
    }
  }

  // upsert: 해당 공연일의 해당 역할에 배정
  const casting = await prisma.casting.upsert({
    where: {
      performanceDateId_roleType: {
        performanceDateId,
        roleType,
      },
    },
    update: { actorId, synced: false },
    create: {
      performanceDateId,
      actorId,
      roleType,
      synced: false,
    },
    include: {
      actor: { select: { name: true } },
      performanceDate: true,
    },
  });

  // 자동 캘린더 동기화 (실패해도 배정 응답에 영향 없음)
  try {
    const dateStr = casting.performanceDate.date.toISOString().split("T")[0];
    const actorEmail = actor!.user?.email || null;
    const eventId = await createCastingEvent(
      casting.roleType,
      casting.actor.name,
      dateStr,
      casting.performanceDate.startTime,
      casting.performanceDate.endTime,
      casting.performanceDate.label,
      actorEmail
    );
    if (eventId) {
      await prisma.casting.update({
        where: { id: casting.id },
        data: { synced: true, calendarEventId: eventId },
      });
    }
  } catch (e) {
    console.error("배정 후 캘린더 자동 동기화 실패:", e);
  }

  return NextResponse.json(casting);
}

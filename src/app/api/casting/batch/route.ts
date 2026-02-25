import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createCastingEvent,
  deleteCalendarEvent,
  mirrorCastingToAllCalendar,
  deleteFromAllCalendar,
} from "@/lib/google-calendar";
import { buildReservationDescription } from "@/lib/schedule";

interface CastingChange {
  performanceDateId: string;
  roleType: string;
  actorId: string | null;
  reservationName?: string | null;
  reservationContact?: string | null;
}

// POST /api/casting/batch - 배역 배정 일괄 처리 (관리자 전용)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { changes } = body as { changes: CastingChange[] };

  if (!changes || !Array.isArray(changes) || changes.length === 0) {
    return NextResponse.json(
      { error: "changes 배열은 필수입니다" },
      { status: 400 }
    );
  }

  const results: Array<{ key: string; success: boolean; error?: string }> = [];

  // 필요한 데이터를 한번에 조회
  const actorIds = [...new Set(changes.filter((c) => c.actorId).map((c) => c.actorId!))];
  const perfDateIds = [...new Set(changes.map((c) => c.performanceDateId))];

  const [actors, perfDates, unavailables, existingCastings] = await Promise.all([
    actorIds.length > 0
      ? prisma.actor.findMany({ where: { id: { in: actorIds } }, include: { user: true } })
      : Promise.resolve([]),
    prisma.performanceDate.findMany({ where: { id: { in: perfDateIds } } }),
    actorIds.length > 0
      ? prisma.unavailableDate.findMany({
          where: { actorId: { in: actorIds }, performanceDateId: { in: perfDateIds } },
        })
      : Promise.resolve([]),
    prisma.casting.findMany({
      where: { performanceDateId: { in: perfDateIds } },
      select: { performanceDateId: true, roleType: true, calendarEventId: true, allCalendarEventId: true, actorId: true },
    }),
  ]);

  const actorMap = new Map(actors.map((a) => [a.id, a]));
  const perfDateMap = new Map(perfDates.map((p) => [p.id, p]));
  const perfDateSet = new Set(perfDates.map((p) => p.id));
  const unavailableSet = new Set(
    unavailables.map((u) => `${u.actorId}_${u.performanceDateId}`)
  );
  const existingCastingMap = new Map(
    existingCastings.map((c) => [`${c.performanceDateId}_${c.roleType}`, { calendarEventId: c.calendarEventId, allCalendarEventId: c.allCalendarEventId, actorId: c.actorId }])
  );

  // 트랜잭션으로 일괄 처리
  const operations = [];
  // 캘린더 동기화 대상 추적
  const syncTargets: Array<{ performanceDateId: string; roleType: string; actorId: string }> = [];
  const deleteTargets: Array<{ roleType: string; calendarEventId: string; allCalendarEventId?: string | null; actorId?: string }> = [];
  // ReservationStatus 메모 upsert 대상
  const memoUpserts: Array<{ performanceDateId: string; name: string | null; contact: string | null }> = [];

  for (const change of changes) {
    const key = `${change.performanceDateId}_${change.roleType}`;

    if (!["MALE_LEAD", "FEMALE_LEAD"].includes(change.roleType)) {
      results.push({ key, success: false, error: "잘못된 roleType" });
      continue;
    }

    if (!perfDateSet.has(change.performanceDateId)) {
      results.push({ key, success: false, error: "공연일 없음" });
      continue;
    }

    // 기존 캘린더 이벤트 삭제 대상 추적
    const existing = existingCastingMap.get(key);
    if (existing?.calendarEventId) {
      deleteTargets.push({ roleType: change.roleType, calendarEventId: existing.calendarEventId, allCalendarEventId: existing.allCalendarEventId, actorId: existing.actorId });
    }

    // 메모 변경사항이 있으면 ReservationStatus upsert 대상으로 추적
    if (change.reservationName !== undefined || change.reservationContact !== undefined) {
      memoUpserts.push({
        performanceDateId: change.performanceDateId,
        name: change.reservationName ?? null,
        contact: change.reservationContact ?? null,
      });
    }

    // 배정 해제
    if (!change.actorId) {
      operations.push(
        prisma.casting.deleteMany({
          where: {
            performanceDateId: change.performanceDateId,
            roleType: change.roleType,
          },
        })
      );
      results.push({ key, success: true });
      continue;
    }

    // 배우 검증
    const actor = actorMap.get(change.actorId);
    if (!actor) {
      results.push({ key, success: false, error: "배우 없음" });
      continue;
    }
    if (actor.roleType !== change.roleType) {
      results.push({ key, success: false, error: "역할 타입 불일치" });
      continue;
    }

    // 불가일정 확인
    if (unavailableSet.has(`${change.actorId}_${change.performanceDateId}`)) {
      results.push({ key, success: false, error: "불가일정 등록됨" });
      continue;
    }

    operations.push(
      prisma.casting.upsert({
        where: {
          performanceDateId_roleType: {
            performanceDateId: change.performanceDateId,
            roleType: change.roleType,
          },
        },
        update: { actorId: change.actorId, synced: false },
        create: {
          performanceDateId: change.performanceDateId,
          actorId: change.actorId,
          roleType: change.roleType,
          synced: false,
        },
      })
    );
    syncTargets.push({
      performanceDateId: change.performanceDateId,
      roleType: change.roleType,
      actorId: change.actorId,
    });
    results.push({ key, success: true });
  }

  // ReservationStatus 메모 upsert 추가
  for (const memo of memoUpserts) {
    operations.push(
      prisma.reservationStatus.upsert({
        where: { performanceDateId: memo.performanceDateId },
        update: { reservationName: memo.name, reservationContact: memo.contact },
        create: { performanceDateId: memo.performanceDateId, hasReservation: false, reservationName: memo.name, reservationContact: memo.contact },
      })
    );
  }

  if (operations.length > 0) {
    await prisma.$transaction(operations);
  }

  // 캘린더 자동 동기화 (실패해도 배정 응답에 영향 없음)
  try {
    // 기존 이벤트 삭제 (취소 알림)
    for (const dt of deleteTargets) {
      const dtActor = dt.actorId ? actorMap.get(dt.actorId) : null;
      const calId =
        dtActor?.calendarId ||
        (dt.roleType === "MALE_LEAD"
          ? process.env.CALENDAR_MALE_LEAD
          : process.env.CALENDAR_FEMALE_LEAD);
      if (calId) {
        await deleteCalendarEvent(calId, dt.calendarEventId, true).catch(() => {});
      }
      if (dt.allCalendarEventId) {
        await deleteFromAllCalendar(dt.allCalendarEventId).catch(() => {});
      }
    }

    // 새 이벤트 생성 (초대 알림)
    // MALE_LEAD인 경우 공연 당일에만 ReservationStatus 메모 → 캘린더 description
    const kstToday = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().split("T")[0];
    const memoMap = new Map(memoUpserts.map((m) => [m.performanceDateId, m]));
    // memoUpserts에 없는 경우 DB에서 조회 필요 → syncTargets의 당일 MALE_LEAD perfDateId 수집
    const maleSyncPerfDateIds = syncTargets
      .filter((st) => {
        if (st.roleType !== "MALE_LEAD" || memoMap.has(st.performanceDateId)) return false;
        const pd = perfDateMap.get(st.performanceDateId);
        return pd && pd.date.toISOString().split("T")[0] === kstToday;
      })
      .map((st) => st.performanceDateId);

    let dbMemoMap = new Map<string, { reservationName: string | null; reservationContact: string | null }>();
    if (maleSyncPerfDateIds.length > 0) {
      const dbMemos = await prisma.reservationStatus.findMany({
        where: { performanceDateId: { in: maleSyncPerfDateIds } },
        select: { performanceDateId: true, reservationName: true, reservationContact: true },
      });
      dbMemoMap = new Map(dbMemos.map((m) => [m.performanceDateId, m]));
    }

    for (const st of syncTargets) {
      const perfDate = perfDateMap.get(st.performanceDateId);
      const actor = actorMap.get(st.actorId);
      if (!perfDate || !actor) continue;

      // MALE_LEAD description: 공연 당일에만 포함
      let description: string | undefined;
      if (st.roleType === "MALE_LEAD") {
        const perfDateStr = perfDate.date.toISOString().split("T")[0];
        if (perfDateStr === kstToday) {
          const localMemo = memoMap.get(st.performanceDateId);
          const name = localMemo?.name || dbMemoMap.get(st.performanceDateId)?.reservationName;
          const contact = localMemo?.contact || dbMemoMap.get(st.performanceDateId)?.reservationContact;
          if (name && contact) {
            description = buildReservationDescription(name, contact);
          }
        }
      }

      const dateStr = perfDate.date.toISOString().split("T")[0];
      const eventId = await createCastingEvent(
        st.roleType,
        actor.name,
        dateStr,
        perfDate.startTime,
        perfDate.endTime,
        perfDate.label,
        actor.calendarId,
        description
      );
      if (eventId) {
        // 전체배우일정 캘린더에도 미러링
        let allEventId: string | null = null;
        try {
          allEventId = await mirrorCastingToAllCalendar(
            st.roleType,
            actor.name,
            dateStr,
            perfDate.startTime,
            perfDate.endTime,
            perfDate.label,
            description
          );
        } catch {}

        await prisma.casting.update({
          where: {
            performanceDateId_roleType: {
              performanceDateId: st.performanceDateId,
              roleType: st.roleType,
            },
          },
          data: { synced: true, calendarEventId: eventId, allCalendarEventId: allEventId },
        });
      }
    }
  } catch (e) {
    console.error("배치 배정 후 캘린더 자동 동기화 실패:", e);
  }

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  return NextResponse.json({
    success: true,
    successCount,
    failCount,
    results: failCount > 0 ? results.filter((r) => !r.success) : undefined,
  });
}

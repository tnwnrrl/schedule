import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCalendarEventSafe } from "@/lib/google-calendar";
import { buildCastingDescription } from "@/lib/schedule";

export type AuditIssueCode =
  | "NOT_SYNCED"
  | "SYNCED_NO_ID"
  | "EVENT_MISSING"
  | "SUMMARY_MISMATCH"
  | "TIME_MISMATCH"
  | "DESCRIPTION_MISMATCH"
  | "ALL_CAL_MISSING";

export type AuditIssue = {
  id: string;
  type: "casting" | "unavailable";
  actorName: string;
  performanceDate: string;
  startTime: string | null;
  roleType: string | null;
  issueCode: AuditIssueCode;
  detail: string;
  dbValue: string;
  calendarValue: string | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// POST /api/calendar/audit - 캘린더 감사 (관리자 전용)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const todayStr = kstNow.toISOString().split("T")[0];

  // 기본 날짜 범위: 오늘-7일 ~ 오늘+30일
  const defaultFrom = new Date(new Date(todayStr).getTime() - 7 * 24 * 60 * 60 * 1000);
  const defaultTo = new Date(new Date(todayStr).getTime() + 30 * 24 * 60 * 60 * 1000);

  const fromDate = body.fromDate ? new Date(body.fromDate) : defaultFrom;
  const toDate = body.toDate ? new Date(new Date(body.toDate).getTime() + 24 * 60 * 60 * 1000) : defaultTo;
  const checkAllCalendar: boolean = body.checkAllCalendar === true;

  const startMs = Date.now();
  const issues: AuditIssue[] = [];

  // === 1. 불가일정 감사 ===
  const unavailables = await prisma.unavailableDate.findMany({
    where: {
      performanceDate: { date: { gte: fromDate, lt: toDate } },
    },
    include: {
      actor: true,
      performanceDate: true,
    },
  });

  for (const item of unavailables) {
    const perfDateStr = item.performanceDate.date.toISOString().split("T")[0];
    const base = {
      id: item.id,
      type: "unavailable" as const,
      actorName: item.actor.name,
      performanceDate: perfDateStr,
      startTime: null,
      roleType: null,
    };

    if (!item.synced) {
      issues.push({
        ...base,
        issueCode: "NOT_SYNCED",
        detail: "synced=false 상태",
        dbValue: "synced: false",
        calendarValue: null,
      });
      continue;
    }

    if (!item.calendarEventId) {
      issues.push({
        ...base,
        issueCode: "SYNCED_NO_ID",
        detail: "synced=true이지만 calendarEventId 없음",
        dbValue: "calendarEventId: null",
        calendarValue: null,
      });
      continue;
    }

    const calendarId = item.actor.calendarId;
    if (!calendarId) continue;

    await sleep(50);
    const result = await getCalendarEventSafe(calendarId, item.calendarEventId);

    if (result.error) {
      issues.push({
        ...base,
        issueCode: "EVENT_MISSING",
        detail: `API 오류: ${result.error}`,
        dbValue: item.calendarEventId,
        calendarValue: null,
      });
      continue;
    }

    if (!result.found) {
      issues.push({
        ...base,
        issueCode: "EVENT_MISSING",
        detail: "캘린더에서 이벤트를 찾을 수 없음 (404)",
        dbValue: item.calendarEventId,
        calendarValue: null,
      });
      continue;
    }

    const event = result.event as {
      summary?: string;
      start?: { date?: string; dateTime?: string };
    };

    const expectedSummary = `[불가] ${item.actor.name}`;
    if (event.summary !== expectedSummary) {
      issues.push({
        ...base,
        issueCode: "SUMMARY_MISMATCH",
        detail: "이벤트 제목 불일치",
        dbValue: expectedSummary,
        calendarValue: event.summary || "(없음)",
      });
    }

    // 전체배우일정 캘린더 체크
    if (checkAllCalendar) {
      const allCalId = process.env.CALENDAR_ALL_ACTORS;
      if (allCalId) {
        if (!item.allCalendarEventId) {
          issues.push({
            ...base,
            issueCode: "ALL_CAL_MISSING",
            detail: "전체배우일정 캘린더 이벤트 ID 없음",
            dbValue: "allCalendarEventId: null",
            calendarValue: null,
          });
        } else {
          await sleep(50);
          const allResult = await getCalendarEventSafe(allCalId, item.allCalendarEventId);
          if (!allResult.found) {
            issues.push({
              ...base,
              issueCode: "ALL_CAL_MISSING",
              detail: allResult.error
                ? `전체배우일정 캘린더 API 오류: ${allResult.error}`
                : "전체배우일정 캘린더에서 이벤트를 찾을 수 없음 (404)",
              dbValue: item.allCalendarEventId,
              calendarValue: null,
            });
          }
        }
      }
    }
  }

  // === 2. 캐스팅 감사 ===
  const castings = await prisma.casting.findMany({
    where: {
      performanceDate: { date: { gte: fromDate, lt: toDate } },
    },
    include: {
      actor: true,
      performanceDate: true,
    },
  });

  // MALE_LEAD의 상대역(FEMALE_LEAD) 이름 일괄 조회
  const malePerfDateIds = castings
    .filter((c) => c.roleType === "MALE_LEAD")
    .map((c) => c.performanceDateId);

  const femaleCastings = malePerfDateIds.length > 0
    ? await prisma.casting.findMany({
        where: {
          performanceDateId: { in: malePerfDateIds },
          roleType: "FEMALE_LEAD",
        },
        include: { actor: { select: { name: true } } },
      })
    : [];
  const partnerNameMap = new Map(femaleCastings.map((c) => [c.performanceDateId, c.actor.name]));

  // 날짜 범위 내 MALE_LEAD 예약 메모 조회 (당일 해당)
  const kstTodayStr = todayStr;
  const resMemos = malePerfDateIds.length > 0
    ? await prisma.reservationStatus.findMany({
        where: { performanceDateId: { in: malePerfDateIds } },
        select: { performanceDateId: true, reservationName: true, reservationContact: true },
      })
    : [];
  const resMemoMap = new Map(resMemos.map((m) => [m.performanceDateId, m]));

  for (const casting of castings) {
    const perfDateStr = casting.performanceDate.date.toISOString().split("T")[0];
    const base = {
      id: casting.id,
      type: "casting" as const,
      actorName: casting.actor.name,
      performanceDate: perfDateStr,
      startTime: casting.performanceDate.startTime,
      roleType: casting.roleType,
    };

    if (!casting.synced) {
      issues.push({
        ...base,
        issueCode: "NOT_SYNCED",
        detail: "synced=false 상태",
        dbValue: "synced: false",
        calendarValue: null,
      });
      continue;
    }

    if (!casting.calendarEventId) {
      issues.push({
        ...base,
        issueCode: "SYNCED_NO_ID",
        detail: "synced=true이지만 calendarEventId 없음",
        dbValue: "calendarEventId: null",
        calendarValue: null,
      });
      continue;
    }

    const calendarId =
      casting.actor.calendarId ||
      (casting.roleType === "MALE_LEAD"
        ? process.env.CALENDAR_MALE_LEAD
        : process.env.CALENDAR_FEMALE_LEAD);

    if (!calendarId) continue;

    await sleep(50);
    const result = await getCalendarEventSafe(calendarId, casting.calendarEventId);

    if (result.error) {
      issues.push({
        ...base,
        issueCode: "EVENT_MISSING",
        detail: `API 오류: ${result.error}`,
        dbValue: casting.calendarEventId,
        calendarValue: null,
      });
      continue;
    }

    if (!result.found) {
      issues.push({
        ...base,
        issueCode: "EVENT_MISSING",
        detail: "캘린더에서 이벤트를 찾을 수 없음 (404)",
        dbValue: casting.calendarEventId,
        calendarValue: null,
      });
      continue;
    }

    const event = result.event as {
      summary?: string;
      start?: { dateTime?: string; date?: string };
      description?: string;
    };

    const label = casting.performanceDate.label;
    const expectedSummary = `${casting.actor.name}${label ? ` (${label})` : ""}`;
    if (event.summary !== expectedSummary) {
      issues.push({
        ...base,
        issueCode: "SUMMARY_MISMATCH",
        detail: "이벤트 제목 불일치",
        dbValue: expectedSummary,
        calendarValue: event.summary || "(없음)",
      });
    }

    // 시작시간 체크
    if (event.start?.dateTime && !event.start.dateTime.includes(casting.performanceDate.startTime)) {
      issues.push({
        ...base,
        issueCode: "TIME_MISMATCH",
        detail: "시작 시간 불일치",
        dbValue: casting.performanceDate.startTime,
        calendarValue: event.start.dateTime,
      });
    }

    // MALE_LEAD description 체크 (상대역 포함 여부)
    if (casting.roleType === "MALE_LEAD") {
      const partnerName = partnerNameMap.get(casting.performanceDateId);
      if (partnerName) {
        const expectedDescPrefix = `상대역: ${partnerName}`;
        const calDesc = event.description || "";

        // 당일이면 예약 메모도 포함된 description 기대
        let expectedDescription: string | undefined;
        if (perfDateStr === kstTodayStr) {
          const memo = resMemoMap.get(casting.performanceDateId);
          expectedDescription = buildCastingDescription({
            partnerName,
            reservationName: memo?.reservationName,
            reservationContact: memo?.reservationContact,
          });
        } else {
          expectedDescription = buildCastingDescription({ partnerName });
        }

        if (expectedDescription && !calDesc.includes(expectedDescPrefix)) {
          issues.push({
            ...base,
            issueCode: "DESCRIPTION_MISMATCH",
            detail: "상대역 정보가 캘린더 description에 없음",
            dbValue: expectedDescription,
            calendarValue: calDesc || "(없음)",
          });
        }
      }
    }

    // 전체배우일정 캘린더 체크
    if (checkAllCalendar) {
      const allCalId = process.env.CALENDAR_ALL_ACTORS;
      if (allCalId) {
        if (!casting.allCalendarEventId) {
          issues.push({
            ...base,
            issueCode: "ALL_CAL_MISSING",
            detail: "전체배우일정 캘린더 이벤트 ID 없음",
            dbValue: "allCalendarEventId: null",
            calendarValue: null,
          });
        } else {
          await sleep(50);
          const allResult = await getCalendarEventSafe(allCalId, casting.allCalendarEventId);
          if (!allResult.found) {
            issues.push({
              ...base,
              issueCode: "ALL_CAL_MISSING",
              detail: allResult.error
                ? `전체배우일정 캘린더 API 오류: ${allResult.error}`
                : "전체배우일정 캘린더에서 이벤트를 찾을 수 없음 (404)",
              dbValue: casting.allCalendarEventId,
              calendarValue: null,
            });
          }
        }
      }
    }
  }

  const durationMs = Date.now() - startMs;

  return NextResponse.json({
    summary: {
      castingsChecked: castings.length,
      unavailableChecked: unavailables.length,
      issuesFound: issues.length,
      durationMs,
    },
    issues,
  });
}

import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { prisma } from "@/lib/prisma";
import { SHOW_TIMES } from "@/lib/constants";

export function formatPerformanceDate(date: Date): string {
  return format(date, "M/d (EEE)", { locale: ko });
}

export function formatPerformanceDateTime(
  date: Date,
  startTime: string,
  endTime?: string | null
): string {
  const dateStr = formatPerformanceDate(date);
  if (endTime) {
    return `${dateStr} ${startTime}~${endTime}`;
  }
  return `${dateStr} ${startTime}`;
}

// 해당 월 PerformanceDate 보장 + 반환 (중복 조회 제거)
export async function ensureAndGetMonthPerformances(year: number, month: number) {
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 1));

  const existing = await prisma.performanceDate.findMany({
    where: { date: { gte: startDate, lt: endDate } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  const daysInMonth = new Date(year, month, 0).getDate();
  const expectedCount = daysInMonth * SHOW_TIMES.length;

  // 이미 모두 존재하면 바로 반환 (가장 흔한 케이스 → DB 왕복 1회로 끝)
  if (existing.length >= expectedCount) {
    return existing;
  }

  // 부족한 레코드만 생성
  const existingSet = new Set(
    existing.map((e) => `${e.date.toISOString().split("T")[0]}_${e.startTime}`)
  );

  const toCreate: Array<{ date: Date; startTime: string }> = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const utcDate = new Date(Date.UTC(year, month - 1, day));
    const dateStr = utcDate.toISOString().split("T")[0];
    for (const time of SHOW_TIMES) {
      if (!existingSet.has(`${dateStr}_${time}`)) {
        toCreate.push({ date: utcDate, startTime: time });
      }
    }
  }

  if (toCreate.length > 0) {
    await prisma.$transaction(
      toCreate.map((d) =>
        prisma.performanceDate.create({ data: d })
      )
    );

    // 생성 후 전체 다시 조회 (정렬 보장)
    return prisma.performanceDate.findMany({
      where: { date: { gte: startDate, lt: endDate } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });
  }

  return existing;
}

/**
 * 해당 월의 날짜 배열 생성 (YYYY-MM-DD 형식)
 */
export function getMonthDates(year: number, month: number): string[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const dates: string[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const m = String(month).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    dates.push(`${year}-${m}-${d}`);
  }
  return dates;
}

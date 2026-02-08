import { format } from "date-fns";
import { ko } from "date-fns/locale";

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

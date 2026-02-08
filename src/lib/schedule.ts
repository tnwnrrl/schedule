// 공연 일정 상수 - 나중에 실제 일정으로 채움
// 시드 데이터에서 PerformanceDate 테이블로 관리됨
// 이 파일은 공통 유틸리티만 제공

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

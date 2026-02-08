"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ScheduleCalendarProps {
  year: number;
  month: number;
  onMonthChange: (year: number, month: number) => void;
  renderCell: (dateStr: string, day: number) => React.ReactNode;
  onCellClick?: (dateStr: string) => void;
  className?: string;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function ScheduleCalendar({
  year,
  month,
  onMonthChange,
  renderCell,
  onCellClick,
  className,
}: ScheduleCalendarProps) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // 해당 월의 1일의 요일 (0=일, 6=토)
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  // 달력 그리드 생성
  const cells: Array<{ day: number; dateStr: string } | null> = [];

  // 빈 셀 (1일 전)
  for (let i = 0; i < firstDayOfWeek; i++) {
    cells.push(null);
  }

  // 날짜 셀
  for (let day = 1; day <= daysInMonth; day++) {
    const m = String(month).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    cells.push({ day, dateStr: `${year}-${m}-${d}` });
  }

  const goPrev = () => {
    if (month === 1) {
      onMonthChange(year - 1, 12);
    } else {
      onMonthChange(year, month - 1);
    }
  };

  const goNext = () => {
    if (month === 12) {
      onMonthChange(year + 1, 1);
    } else {
      onMonthChange(year, month + 1);
    }
  };

  return (
    <div className={cn("w-full", className)}>
      {/* 헤더: 월 네비게이션 */}
      <div className="mb-4 flex items-center justify-center gap-4">
        <Button variant="outline" size="icon-sm" onClick={goPrev}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-bold">
          {year}년 {month}월
        </h2>
        <Button variant="outline" size="icon-sm" onClick={goNext}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 border-b">
        {WEEKDAYS.map((wd, i) => (
          <div
            key={wd}
            className={cn(
              "py-2 text-center text-sm font-medium",
              i === 0 && "text-red-500",
              i === 6 && "text-blue-500"
            )}
          >
            {wd}
          </div>
        ))}
      </div>

      {/* 달력 그리드 */}
      <div className="grid grid-cols-7">
        {cells.map((cell, idx) => {
          if (!cell) {
            return <div key={`empty-${idx}`} className="min-h-[100px] border-b border-r bg-gray-50 last:border-r-0" />;
          }

          const { day, dateStr } = cell;
          const isToday = dateStr === todayStr;
          const dayOfWeek = (firstDayOfWeek + day - 1) % 7;
          const isSunday = dayOfWeek === 0;
          const isSaturday = dayOfWeek === 6;

          return (
            <div
              key={dateStr}
              className={cn(
                "min-h-[100px] border-b border-r p-1 transition-colors",
                isToday && "bg-blue-50",
                onCellClick && "cursor-pointer hover:bg-gray-50",
                !isToday && !onCellClick && "bg-white"
              )}
              onClick={() => onCellClick?.(dateStr)}
            >
              <div
                className={cn(
                  "mb-1 text-sm font-medium",
                  isToday && "inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white",
                  !isToday && isSunday && "text-red-500",
                  !isToday && isSaturday && "text-blue-500"
                )}
              >
                {day}
              </div>
              <div className="text-xs">{renderCell(dateStr, day)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

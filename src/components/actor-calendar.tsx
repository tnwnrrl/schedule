"use client";

import { useState, useEffect, useCallback } from "react";
import { ScheduleCalendar } from "@/components/schedule-calendar";
import { SHOW_TIME_LABELS, type ShowTime } from "@/lib/constants";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ActorCalendarProps {
  actorId: string;
}

interface ScheduleData {
  performances: Record<string, Array<{ id: string; startTime: string; label: string | null }>>;
  castings: Record<string, { actorId: string; actorName: string }>;
  unavailable: Record<string, string[]>;
  actors: Array<{ id: string; name: string; roleType: string }>;
}

export function ActorCalendar({ actorId }: ActorCalendarProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (y: number, m: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/schedule?year=${y}&month=${m}`);
      if (!res.ok) {
        toast.error("일정을 불러오는데 실패했습니다");
        return;
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error("Schedule fetch error:", e);
      toast.error("일정을 불러오는데 실패했습니다");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(year, month);
  }, [year, month, fetchData]);

  const handleMonthChange = (y: number, m: number) => {
    setYear(y);
    setMonth(m);
  };

  const renderCell = (dateStr: string) => {
    if (!data) return null;
    const perfs = data.performances[dateStr];
    if (!perfs || perfs.length === 0) return null;

    // 내 배정 회차 찾기
    const myShows = perfs.filter((p) => {
      const maleKey = `${p.id}_MALE_LEAD`;
      const femaleKey = `${p.id}_FEMALE_LEAD`;
      return (
        data.castings[maleKey]?.actorId === actorId ||
        data.castings[femaleKey]?.actorId === actorId
      );
    });

    // 불가일정 여부
    const unavailDates = data.unavailable[actorId] || [];
    const isUnavailable = unavailDates.includes(dateStr);

    if (myShows.length === 0 && !isUnavailable) return null;

    return (
      <div className="space-y-0.5">
        {myShows.map((show, i) => {
          const label =
            SHOW_TIME_LABELS[show.startTime as ShowTime] || show.startTime;
          return (
            <div key={i} className="flex items-center gap-0.5 text-blue-700 font-medium">
              <span className="text-[10px]">★</span>
              <span className="truncate">{label}</span>
            </div>
          );
        })}
        {isUnavailable && (
          <div className="text-red-500 font-medium flex items-center gap-0.5">
            <span className="text-[10px]">✕</span>
            <span>불가</span>
          </div>
        )}
      </div>
    );
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-500">일정 불러오는 중...</div>
      </div>
    );
  }

  return (
    <ScheduleCalendar
      year={year}
      month={month}
      onMonthChange={handleMonthChange}
      renderCell={renderCell}
    />
  );
}

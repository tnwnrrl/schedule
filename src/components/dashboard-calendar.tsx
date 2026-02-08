"use client";

import { useState, useEffect, useCallback } from "react";
import { ScheduleCalendar } from "@/components/schedule-calendar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ScheduleData {
  performances: Record<string, Array<{ id: string; startTime: string; label: string | null }>>;
  castings: Record<string, { actorId: string; actorName: string }>;
  unavailable: Record<string, string[]>;
  actors: Array<{ id: string; name: string; roleType: string }>;
}

export function DashboardCalendar() {
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
        toast.error("스케줄을 불러오는데 실패했습니다");
        return;
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error("Schedule fetch error:", e);
      toast.error("스케줄을 불러오는데 실패했습니다");
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

    let filled = 0;
    const total = perfs.length * 2;

    for (const p of perfs) {
      if (data.castings[`${p.id}_MALE_LEAD`]) filled++;
      if (data.castings[`${p.id}_FEMALE_LEAD`]) filled++;
    }

    return (
      <div className="flex justify-center">
        <Badge
          variant={filled === total ? "default" : filled > 0 ? "secondary" : "destructive"}
          className="text-[10px] px-1 py-0"
        >
          {filled}/{total}
        </Badge>
      </div>
    );
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="text-gray-500">불러오는 중...</div>
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

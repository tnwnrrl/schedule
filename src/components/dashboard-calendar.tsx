"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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

  // 역할별 배우 목록 (사전 분류)
  const actorsByRole = useMemo(() => {
    if (!data) return { MALE_LEAD: 0, FEMALE_LEAD: 0 };
    return {
      MALE_LEAD: data.actors.filter((a) => a.roleType === "MALE_LEAD"),
      FEMALE_LEAD: data.actors.filter((a) => a.roleType === "FEMALE_LEAD"),
    };
  }, [data]);

  // 특정 회차에 가용한 배우 수
  const getAvailableCount = (perfId: string, roleType: string): number => {
    if (!data || typeof actorsByRole === "object" && !Array.isArray(actorsByRole.MALE_LEAD)) return 0;
    const actors = actorsByRole[roleType as keyof typeof actorsByRole];
    if (!Array.isArray(actors)) return 0;
    return actors.filter((a) => {
      const unavailIds = data.unavailable[a.id] || [];
      return !unavailIds.includes(perfId);
    }).length;
  };

  const renderCell = (dateStr: string) => {
    if (!data) return null;
    const perfs = data.performances[dateStr];
    if (!perfs || perfs.length === 0) return null;

    let filled = 0;
    const total = perfs.length * 2;

    const slots = perfs.map((p, i) => {
      const hasMale = !!data.castings[`${p.id}_MALE_LEAD`];
      const hasFemale = !!data.castings[`${p.id}_FEMALE_LEAD`];
      if (hasMale) filled++;
      if (hasFemale) filled++;
      const maleAvail = getAvailableCount(p.id, "MALE_LEAD");
      const femaleAvail = getAvailableCount(p.id, "FEMALE_LEAD");
      return { index: i + 1, hasMale, hasFemale, maleAvail, femaleAvail };
    });

    return (
      <div className="space-y-0.5">
        {slots.map((s) => (
          <div key={s.index} className="flex items-center gap-0.5 leading-tight text-[10px]">
            <span className="text-gray-400 w-2.5 shrink-0">{s.index}</span>
            <span className={cn(
              "w-3 text-center",
              s.maleAvail === 0 ? "text-red-500 font-bold" : s.hasMale ? "text-blue-600" : "text-blue-400"
            )}>
              {s.maleAvail}
            </span>
            <span className="text-gray-300">/</span>
            <span className={cn(
              "w-3 text-center",
              s.femaleAvail === 0 ? "text-red-500 font-bold" : s.hasFemale ? "text-pink-600" : "text-pink-400"
            )}>
              {s.femaleAvail}
            </span>
          </div>
        ))}
        <div className="mt-1 flex justify-center">
          <Badge
            variant={filled === total ? "default" : filled > 0 ? "secondary" : "destructive"}
            className="text-[10px] px-1 py-0"
          >
            {filled}/{total}
          </Badge>
        </div>
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

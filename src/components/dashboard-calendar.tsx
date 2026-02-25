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
  overriddenActors?: string[];
  reservations?: Record<string, boolean>;
  reservationCheckedAt?: string | null;
}

export function DashboardCalendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [overriddenSet, setOverriddenSet] = useState<Set<string>>(new Set());
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchData = useCallback(async (y: number, m: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/schedule?year=${y}&month=${m}`);
      if (!res.ok) {
        toast.error("스케줄을 불러오는데 실패했습니다");
        return;
      }
      const json: ScheduleData = await res.json();
      setData(json);
      setOverriddenSet(new Set(json.overriddenActors || []));
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

  const handleToggleOverride = async (actorId: string) => {
    setTogglingId(actorId);
    try {
      const res = await fetch("/api/actor-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId, year, month }),
      });
      if (!res.ok) {
        toast.error("오버라이드 변경 실패");
        return;
      }
      const { overridden } = await res.json();
      setOverriddenSet((prev) => {
        const next = new Set(prev);
        if (overridden) {
          next.add(actorId);
        } else {
          next.delete(actorId);
        }
        return next;
      });
    } catch {
      toast.error("오버라이드 변경 실패");
    } finally {
      setTogglingId(null);
    }
  };

  // 역할별 배우 목록 (사전 분류)
  const actorsByRole = useMemo(() => {
    if (!data) return { MALE_LEAD: [] as ScheduleData["actors"], FEMALE_LEAD: [] as ScheduleData["actors"] };
    return {
      MALE_LEAD: data.actors.filter((a) => a.roleType === "MALE_LEAD"),
      FEMALE_LEAD: data.actors.filter((a) => a.roleType === "FEMALE_LEAD"),
    };
  }, [data]);

  // 특정 회차에 가용한 배우 수 (override 반영)
  const getAvailableCount = (perfId: string, roleType: string): number => {
    if (!data) return 0;
    const actors = actorsByRole[roleType as keyof typeof actorsByRole];
    if (!Array.isArray(actors)) return 0;
    return actors.filter((a) => {
      if (overriddenSet.has(a.id)) return false;
      const unavailIds = data.unavailable[a.id] || [];
      return !unavailIds.includes(perfId);
    }).length;
  };

  const renderCell = (dateStr: string) => {
    if (!data) return null;
    const perfs = data.performances[dateStr];
    if (!perfs || perfs.length === 0) return null;

    const hasReservationData = data.reservations && Object.keys(data.reservations).length > 0;

    let filled = 0;
    const total = perfs.length * 2;

    const slots = perfs.map((p, i) => {
      const hasMale = !!data.castings[`${p.id}_MALE_LEAD`];
      const hasFemale = !!data.castings[`${p.id}_FEMALE_LEAD`];
      if (hasMale) filled++;
      if (hasFemale) filled++;
      const maleAvail = getAvailableCount(p.id, "MALE_LEAD");
      const femaleAvail = getAvailableCount(p.id, "FEMALE_LEAD");
      const hasReservation = hasReservationData ? data.reservations![p.id] : undefined;
      return { index: i + 1, hasMale, hasFemale, maleAvail, femaleAvail, hasReservation };
    });

    // 예약 있지만 미배정인 회차 수
    const needsCastingCount = hasReservationData
      ? slots.filter((s) => s.hasReservation === true && (!s.hasMale || !s.hasFemale)).length
      : 0;

    return (
      <div className="space-y-0.5">
        {slots.map((s) => {
          const noReservation = hasReservationData && s.hasReservation === false;
          return (
            <div key={s.index} className={cn(
              "flex items-center gap-0.5 leading-tight text-[10px]",
              noReservation && "opacity-30"
            )}>
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
          );
        })}
        <div className="mt-1 flex flex-wrap justify-center gap-0.5">
          <Badge
            variant={filled === total ? "default" : filled > 0 ? "secondary" : "destructive"}
            className="text-[10px] px-1 py-0"
          >
            {filled}/{total}
          </Badge>
          {needsCastingCount > 0 && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 border-amber-400 text-amber-600">
              배정필요 {needsCastingCount}
            </Badge>
          )}
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
    <div className="space-y-4">
      {/* 배우 오버라이드 칩 패널 */}
      {data && data.overriddenActors !== undefined && (
        <div className="rounded-lg border p-3 space-y-2">
          <div className="text-xs font-medium text-gray-500">배우 전체불가 설정 (클릭하여 토글)</div>
          <div className="flex flex-wrap gap-1.5">
            {(["MALE_LEAD", "FEMALE_LEAD"] as const).map((roleType) => {
              const actors = actorsByRole[roleType];
              if (!Array.isArray(actors)) return null;
              return actors.map((actor) => {
                const isOverridden = overriddenSet.has(actor.id);
                const isToggling = togglingId === actor.id;
                return (
                  <button
                    key={actor.id}
                    onClick={() => handleToggleOverride(actor.id)}
                    disabled={isToggling}
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                      "border cursor-pointer disabled:opacity-50",
                      isOverridden
                        ? "bg-gray-100 text-gray-400 line-through border-gray-200"
                        : roleType === "MALE_LEAD"
                          ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                          : "bg-pink-50 text-pink-700 border-pink-200 hover:bg-pink-100"
                    )}
                  >
                    {actor.name}
                  </button>
                );
              });
            })}
          </div>
        </div>
      )}

      <ScheduleCalendar
        year={year}
        month={month}
        onMonthChange={handleMonthChange}
        renderCell={renderCell}
      />
    </div>
  );
}

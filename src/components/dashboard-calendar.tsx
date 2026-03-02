"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ScheduleCalendar } from "@/components/schedule-calendar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PERFORMANCE_PRICES } from "@/lib/constants";
import { CalendarCheck, Banknote, AlertTriangle, Users } from "lucide-react";

interface ScheduleData {
  performances: Record<string, Array<{ id: string; startTime: string; label: string | null }>>;
  castings: Record<string, { actorId: string; actorName: string }>;
  unavailable: Record<string, string[]>;
  actors: Array<{ id: string; name: string; roleType: string }>;
  overriddenActors?: string[];
  reservations?: Record<string, boolean>;
  reservationCheckedAt?: string | null;
}

interface PerfMeta {
  id: string;
  dateStr: string;
  startTime: string;
  isWeekend: boolean;
  hasReservation: boolean;
  hasMale: boolean;
  hasFemale: boolean;
  maleActorId: string | null;
  femaleActorId: string | null;
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

  // 모든 회차 평탄화 + 메타데이터
  const allPerfs = useMemo<PerfMeta[]>(() => {
    if (!data) return [];
    const result: PerfMeta[] = [];
    for (const [dateStr, perfs] of Object.entries(data.performances)) {
      const [y, m, d] = dateStr.split("-").map(Number);
      const dayOfWeek = new Date(y, m - 1, d).getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      for (const p of perfs) {
        const maleCasting = data.castings[`${p.id}_MALE_LEAD`];
        const femaleCasting = data.castings[`${p.id}_FEMALE_LEAD`];
        result.push({
          id: p.id,
          dateStr,
          startTime: p.startTime,
          isWeekend,
          hasReservation: data.reservations?.[p.id] === true,
          hasMale: !!maleCasting,
          hasFemale: !!femaleCasting,
          maleActorId: maleCasting?.actorId ?? null,
          femaleActorId: femaleCasting?.actorId ?? null,
        });
      }
    }
    return result;
  }, [data]);

  // 통계 계산
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalPerfs = allPerfs.length;

    // 예약현황 & 매출: 과거=배정 기준, 미래=예약 기준
    const reservedPerfs = allPerfs.filter((p) => {
      const perfDate = new Date(p.dateStr);
      perfDate.setHours(0, 0, 0, 0);
      if (perfDate < today) {
        return p.hasMale || p.hasFemale;
      }
      return p.hasReservation;
    });
    const reservedCount = reservedPerfs.length;

    const weekdayRevenue = reservedPerfs.filter((p) => !p.isWeekend).length;
    const weekendRevenue = reservedPerfs.filter((p) => p.isWeekend).length;
    const totalRevenue =
      weekdayRevenue * PERFORMANCE_PRICES.weekday +
      weekendRevenue * PERFORMANCE_PRICES.weekend;

    const weekdayReserved = reservedPerfs.filter((p) => !p.isWeekend).length;
    const weekendReserved = reservedPerfs.filter((p) => p.isWeekend).length;

    // 배정필요: 미래 공연 중 예약 있는데 배역 미완
    const futureReservedPerfs = reservedPerfs.filter((p) => {
      const perfDate = new Date(p.dateStr);
      perfDate.setHours(0, 0, 0, 0);
      return perfDate >= today;
    });
    const needsCasting = futureReservedPerfs.filter(
      (p) => !p.hasMale || !p.hasFemale
    ).length;

    // 수정필요: 미래 공연 중 예약 취소인데 배정 존재
    const hasReservationData = data?.reservations && Object.keys(data.reservations).length > 0;
    const needsFix = hasReservationData
      ? allPerfs.filter((p) => {
          const perfDate = new Date(p.dateStr);
          perfDate.setHours(0, 0, 0, 0);
          return perfDate >= today && data.reservations![p.id] === false && (p.hasMale || p.hasFemale);
        }).length
      : 0;

    const weekdayTotal = allPerfs.filter((p) => !p.isWeekend).length;
    const weekendTotal = allPerfs.filter((p) => p.isWeekend).length;
    const weekdayRate = weekdayTotal > 0 ? Math.round((weekdayReserved / weekdayTotal) * 100) : 0;
    const weekendRate = weekendTotal > 0 ? Math.round((weekendReserved / weekendTotal) * 100) : 0;

    return {
      totalPerfs,
      reservedCount,
      reserveRate: totalPerfs > 0 ? Math.round((reservedCount / totalPerfs) * 100) : 0,
      totalRevenue,
      weekdayRevenue,
      weekendRevenue,
      weekdayTotal,
      weekendTotal,
      weekdayReserved,
      weekendReserved,
      weekdayRate,
      weekendRate,
      needsCasting,
      needsFix,
      totalAlerts: needsCasting + needsFix,
    };
  }, [allPerfs, data]);

  // 날짜별 첫 예약회차 (초번 계산용)
  const firstReservedByDate = useMemo(() => {
    const byDate = new Map<string, PerfMeta[]>();
    for (const p of allPerfs) {
      if (!p.hasReservation) continue;
      const arr = byDate.get(p.dateStr) || [];
      arr.push(p);
      byDate.set(p.dateStr, arr);
    }
    const result = new Map<string, PerfMeta>();
    for (const [dateStr, perfs] of byDate) {
      perfs.sort((a, b) => a.startTime.localeCompare(b.startTime));
      result.set(dateStr, perfs[0]);
    }
    return result;
  }, [allPerfs]);

  // 배우별 예약공연 통계
  const actorStats = useMemo(() => {
    if (!data) return [];
    const result: Array<{
      id: string;
      name: string;
      roleType: string;
      weekday: number;
      weekend: number;
      firstShift: number;
      pay: number;
    }> = [];

    for (const actor of data.actors) {
      const roleKey = actor.roleType === "MALE_LEAD" ? "maleActorId" : "femaleActorId";
      const reserved = allPerfs.filter(
        (p) => p.hasReservation && p[roleKey] === actor.id
      );
      const weekday = reserved.filter((p) => !p.isWeekend).length;
      const weekend = reserved.filter((p) => p.isWeekend).length;
      const totalShows = weekday + weekend;

      // 초번: 해당 날짜의 첫 예약회차에 배정된 횟수 (남자배우만)
      let firstShift = 0;
      if (actor.roleType === "MALE_LEAD") {
        for (const [, firstPerf] of firstReservedByDate) {
          if (firstPerf.maleActorId === actor.id) firstShift++;
        }
      }

      // 예상 출연료: 회차 × 3만원 + 초번 × 3천원
      const pay = totalShows * 30000 + firstShift * 3000;

      result.push({
        id: actor.id,
        name: actor.name,
        roleType: actor.roleType,
        weekday,
        weekend,
        firstShift,
        pay,
      });
    }

    return result;
  }, [data, allPerfs, firstReservedByDate]);

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

    // 예약 있지만 미배정인 회차 수 (과거 날짜는 제외)
    const cellDate = new Date(dateStr);
    cellDate.setHours(0, 0, 0, 0);
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const isPast = cellDate < todayDate;
    const needsCastingCount = hasReservationData && !isPast
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

  const formatRevenue = (amount: number) => {
    if (amount === 0) return "0";
    return `${(amount / 10000).toLocaleString()}`;
  };

  if (loading && !data) {
    return <DashboardSkeleton />;
  }

  const maleActorStats = actorStats.filter((a) => a.roleType === "MALE_LEAD");
  const femaleActorStats = actorStats.filter((a) => a.roleType === "FEMALE_LEAD");

  return (
    <div className="space-y-4">
      {/* 통계 카드 3개 */}
      <div className="grid gap-4 grid-cols-3">
        <Card className="py-4">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-4">
            <CardTitle className="text-sm font-medium text-gray-600">예약현황</CardTitle>
            <CalendarCheck className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent className="px-4">
            <div className="text-2xl font-bold">
              {stats.reservedCount} <span className="text-base font-normal text-gray-400">/ {stats.totalPerfs}</span>
              <span className="text-sm font-normal text-gray-500 ml-1">({stats.reserveRate}%)</span>
            </div>
            <div className="flex gap-3 text-xs text-gray-500 mt-1">
              <span>평일 {stats.weekdayReserved}/{stats.weekdayTotal} ({stats.weekdayRate}%)</span>
              <span>주말 {stats.weekendReserved}/{stats.weekendTotal} ({stats.weekendRate}%)</span>
            </div>
          </CardContent>
        </Card>

        <Card className="py-4">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-4">
            <CardTitle className="text-sm font-medium text-gray-600">예상매출</CardTitle>
            <Banknote className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent className="px-4">
            <div className="text-2xl font-bold">
              {formatRevenue(stats.totalRevenue)}<span className="text-base font-normal text-gray-500">만원</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              평일 {stats.weekdayRevenue}회 × 20만 / 주말 {stats.weekendRevenue}회 × 24만
            </p>
          </CardContent>
        </Card>

        <Card className={cn("py-4", stats.totalAlerts > 0 && "border-amber-300")}>
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-4">
            <CardTitle className="text-sm font-medium text-gray-600">배정필요</CardTitle>
            <AlertTriangle className={cn("h-4 w-4", stats.totalAlerts > 0 ? "text-amber-500" : "text-gray-400")} />
          </CardHeader>
          <CardContent className="px-4">
            <div className="text-2xl font-bold">
              {stats.totalAlerts}<span className="text-base font-normal text-gray-500">건</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {stats.needsCasting > 0 && `배정필요 ${stats.needsCasting}`}
              {stats.needsCasting > 0 && stats.needsFix > 0 && " + "}
              {stats.needsFix > 0 && `수정필요 ${stats.needsFix}`}
              {stats.totalAlerts === 0 && "이상 없음"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 배우별 예약공연 테이블 */}
      <Card className="py-4">
        <CardHeader className="flex flex-row items-center justify-between pb-1 px-4">
          <div>
            <CardTitle className="text-sm font-medium text-gray-600">배우별 예약공연</CardTitle>
            <p className="text-xs text-gray-500 mt-1">
              출연료 합계 <span className="font-medium text-gray-700">{((actorStats.reduce((sum, a) => sum + a.pay, 0)) / 10000).toLocaleString()}만원</span>
            </p>
          </div>
          <Users className="h-4 w-4 text-gray-400" />
        </CardHeader>
        <CardContent className="px-4">
          <div className="grid gap-4 grid-cols-2">
            {/* 남자 배우 */}
            <div>
              <div className="text-xs font-medium text-blue-600 mb-1">남1</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs h-8">이름</TableHead>
                    <TableHead className="text-xs h-8 text-right">초번</TableHead>
                    <TableHead className="text-xs h-8 text-right">평일</TableHead>
                    <TableHead className="text-xs h-8 text-right">주말</TableHead>
                    <TableHead className="text-xs h-8 text-right">출연료</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {maleActorStats.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-xs py-1.5">{a.name}</TableCell>
                      <TableCell className="text-xs py-1.5 text-right">{a.firstShift}</TableCell>
                      <TableCell className="text-xs py-1.5 text-right">{a.weekday}</TableCell>
                      <TableCell className="text-xs py-1.5 text-right">{a.weekend}</TableCell>
                      <TableCell className="text-xs py-1.5 text-right font-medium">{(a.pay / 10000).toLocaleString()}만</TableCell>
                    </TableRow>
                  ))}
                  {maleActorStats.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-xs py-1.5 text-center text-gray-400">배우 없음</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* 여자 배우 */}
            <div>
              <div className="text-xs font-medium text-pink-600 mb-1">여1</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs h-8">이름</TableHead>
                    <TableHead className="text-xs h-8 text-right">평일</TableHead>
                    <TableHead className="text-xs h-8 text-right">주말</TableHead>
                    <TableHead className="text-xs h-8 text-right">출연료</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {femaleActorStats.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-xs py-1.5">{a.name}</TableCell>
                      <TableCell className="text-xs py-1.5 text-right">{a.weekday}</TableCell>
                      <TableCell className="text-xs py-1.5 text-right">{a.weekend}</TableCell>
                      <TableCell className="text-xs py-1.5 text-right font-medium">{(a.pay / 10000).toLocaleString()}만</TableCell>
                    </TableRow>
                  ))}
                  {femaleActorStats.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-xs py-1.5 text-center text-gray-400">배우 없음</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 배정 현황 캘린더 */}
      <Card className="py-4">
        <CardHeader className="px-4 pb-1">
          <CardTitle className="text-sm font-medium text-gray-600">배정 현황</CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          {/* 배우 오버라이드 칩 패널 */}
          {data && data.overriddenActors !== undefined && (
            <div className="rounded-lg border p-3 space-y-2 mb-4">
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
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      {/* 통계 카드 스켈레톤 */}
      <div className="grid gap-4 grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-4 w-16 animate-pulse rounded bg-gray-200" />
              <div className="h-4 w-4 animate-pulse rounded bg-gray-200" />
            </div>
            <div className="h-8 w-24 animate-pulse rounded bg-gray-200" />
            <div className="h-3 w-32 animate-pulse rounded bg-gray-200 mt-2" />
          </div>
        ))}
      </div>
      {/* 배우 테이블 스켈레톤 */}
      <div className="rounded-xl border bg-white p-4">
        <div className="h-4 w-28 animate-pulse rounded bg-gray-200 mb-3" />
        <div className="grid gap-4 grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-8 animate-pulse rounded bg-gray-200" />
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="h-6 animate-pulse rounded bg-gray-100" />
              ))}
            </div>
          ))}
        </div>
      </div>
      {/* 캘린더 스켈레톤 */}
      <div className="rounded-xl border bg-white p-4">
        <div className="h-4 w-20 animate-pulse rounded bg-gray-200 mb-4" />
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded bg-gray-100" />
          ))}
        </div>
      </div>
    </div>
  );
}

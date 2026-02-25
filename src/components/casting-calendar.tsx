"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { ScheduleCalendar } from "@/components/schedule-calendar";
import { SHOW_TIMES, SHOW_TIME_LABELS } from "@/lib/constants";
import { ROLE_TYPE_LABEL } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";

interface Performance {
  id: string;
  startTime: string;
  label: string | null;
}

interface Actor {
  id: string;
  name: string;
  roleType: string;
}

interface CastingInfo {
  castingId: string;
  actorId: string;
  actorName: string;
  synced: boolean;
  reservationName?: string | null;
  reservationContact?: string | null;
}

interface ScheduleData {
  performances: Record<string, Performance[]>;
  castings: Record<string, CastingInfo>;
  unavailable: Record<string, string[]>;
  actors: Actor[];
  overriddenActors?: string[];
  reservations?: Record<string, boolean>;
  reservationCheckedAt?: string | null;
}

export function CastingCalendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dialogCastings, setDialogCastings] = useState<Record<string, string>>({});
  const [dialogMemos, setDialogMemos] = useState<Record<string, { name: string; contact: string }>>({});
  const [saving, setSaving] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const dialogCloseRef = useRef(0);

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

  const handleCellClick = (dateStr: string) => {
    if (Date.now() - dialogCloseRef.current < 300) return;
    if (!data?.performances[dateStr]) return;
    setSelectedDate(dateStr);

    // 현재 배정 상태를 dialog state에 복사
    const perfs = data.performances[dateStr];
    const initial: Record<string, string> = {};
    const initialMemos: Record<string, { name: string; contact: string }> = {};
    for (const p of perfs) {
      for (const roleType of ["MALE_LEAD", "FEMALE_LEAD"]) {
        const key = `${p.id}_${roleType}`;
        const casting = data.castings[key];
        initial[key] = casting?.actorId || "";
        if (roleType === "MALE_LEAD") {
          initialMemos[p.id] = {
            name: casting?.reservationName || "",
            contact: casting?.reservationContact || "",
          };
        }
      }
    }
    setDialogCastings(initial);
    setDialogMemos(initialMemos);
  };

  const handleSave = async () => {
    if (!data || !selectedDate) return;
    setSaving(true);

    const perfs = data.performances[selectedDate];
    const changes: Array<{
      performanceDateId: string;
      roleType: string;
      actorId: string | null;
      reservationName?: string | null;
      reservationContact?: string | null;
    }> = [];

    for (const p of perfs) {
      for (const roleType of ["MALE_LEAD", "FEMALE_LEAD"]) {
        const key = `${p.id}_${roleType}`;
        const raw = dialogCastings[key];
        const newActorId = raw && raw !== "__none__" ? raw : null;
        const oldActorId = data.castings[key]?.actorId || null;
        const casting = data.castings[key];

        // MALE_LEAD 메모 변경 확인
        let memoChanged = false;
        let memoData: { reservationName?: string | null; reservationContact?: string | null } = {};
        if (roleType === "MALE_LEAD") {
          const memo = dialogMemos[p.id];
          const oldName = casting?.reservationName || "";
          const oldContact = casting?.reservationContact || "";
          if (memo && (memo.name !== oldName || memo.contact !== oldContact)) {
            memoChanged = true;
            memoData = {
              reservationName: memo.name || null,
              reservationContact: memo.contact || null,
            };
          }
        }

        if (newActorId !== oldActorId || memoChanged) {
          changes.push({
            performanceDateId: p.id,
            roleType,
            actorId: newActorId ?? oldActorId,
            ...memoData,
          });
        }
      }
    }

    if (changes.length === 0) {
      setSelectedDate(null);
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/casting/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "배정 실패");
        setSaving(false);
        return;
      }
      const result = await res.json();
      if (result.failCount > 0) {
        toast.error(`${result.failCount}건 실패`);
      } else {
        toast.success(`${result.successCount}건 배정 완료`);
      }
      setSelectedDate(null);
      await fetchData(year, month);
    } catch {
      toast.error("저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleNotify = async () => {
    if (!data || !selectedDate) return;

    const perfs = data.performances[selectedDate];
    const castingIds: string[] = [];
    for (const p of perfs) {
      for (const roleType of ["MALE_LEAD", "FEMALE_LEAD"]) {
        const key = `${p.id}_${roleType}`;
        const casting = data.castings[key];
        if (casting?.castingId) {
          castingIds.push(casting.castingId);
        }
      }
    }

    if (castingIds.length === 0) {
      toast.error("배정된 캐스팅이 없습니다");
      return;
    }

    setNotifying(true);
    try {
      const res = await fetch("/api/casting/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ castingIds }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || "알림 발송 실패");
      } else if (result.sent > 0 && result.skipped === 0 && result.failed === 0) {
        toast.success(result.message);
      } else if (result.sent === 0 && result.skipped > 0) {
        toast.warning(result.message);
      } else {
        toast.info(result.message);
      }
    } catch {
      toast.error("알림 발송 실패");
    } finally {
      setNotifying(false);
    }
  };

  // 배우별 배정 횟수 (사전 계산)
  const actorCastingCounts = useMemo(() => {
    if (!data) return new Map<string, number>();
    const counts = new Map<string, number>();
    for (const c of Object.values(data.castings)) {
      counts.set(c.actorId, (counts.get(c.actorId) || 0) + 1);
    }
    return counts;
  }, [data]);

  const getActorCastingCount = (actorId: string): number => {
    return actorCastingCounts.get(actorId) || 0;
  };

  // 역할별 배우 목록 (사전 분류)
  const actorsByRole = useMemo(() => {
    if (!data) return { MALE_LEAD: [] as Actor[], FEMALE_LEAD: [] as Actor[] };
    return {
      MALE_LEAD: data.actors.filter((a) => a.roleType === "MALE_LEAD"),
      FEMALE_LEAD: data.actors.filter((a) => a.roleType === "FEMALE_LEAD"),
    };
  }, [data]);

  // overridden 배우 Set (사전 계산)
  const overriddenSet = useMemo(() => {
    return new Set(data?.overriddenActors || []);
  }, [data?.overriddenActors]);

  // 특정 회차에 불가일정인 배우 필터 (override 반영)
  const getAvailableActors = (perfId: string, roleType: string): Actor[] => {
    if (!data) return [];
    const actors = actorsByRole[roleType as keyof typeof actorsByRole] || [];
    return actors.filter((a) => {
      if (overriddenSet.has(a.id)) return false;
      const unavailIds = data.unavailable[a.id] || [];
      return !unavailIds.includes(perfId);
    });
  };

  const renderCell = (dateStr: string) => {
    if (!data) return null;
    const perfs = data.performances[dateStr];
    if (!perfs || perfs.length === 0) return null;

    const hasReservationData = data.reservations && Object.keys(data.reservations).length > 0;

    const slots = perfs.map((p) => {
      const male = data.castings[`${p.id}_MALE_LEAD`];
      const female = data.castings[`${p.id}_FEMALE_LEAD`];
      const maleAvailable = !male ? getAvailableActors(p.id, "MALE_LEAD").length > 0 : true;
      const femaleAvailable = !female ? getAvailableActors(p.id, "FEMALE_LEAD").length > 0 : true;
      const hasReservation = hasReservationData ? data.reservations![p.id] : undefined;
      return { perfId: p.id, startTime: p.startTime, male, female, maleAvailable, femaleAvailable, hasReservation };
    });

    // 요약: 배정된 슬롯 수
    const filled = slots.reduce((acc, s) => acc + (s.male ? 1 : 0) + (s.female ? 1 : 0), 0);
    const total = slots.length * 2;

    // 예약 있지만 미배정인 회차 수
    const needsCastingCount = hasReservationData
      ? slots.filter((s) => s.hasReservation === true && (!s.male || !s.female)).length
      : 0;

    return (
      <div className="space-y-0.5">
        {slots.map((s, i) => {
          const mName = s.male?.actorName;
          const fName = s.female?.actorName;
          const noReservation = hasReservationData && s.hasReservation === false;
          const needsCasting = s.hasReservation === true && (!s.male || !s.female);
          return (
            <div key={i} className={cn(
              "flex items-center gap-0.5 leading-tight",
              noReservation && "opacity-30"
            )}>
              <span className="text-[10px] text-gray-400 w-3 shrink-0 flex items-center">
                {i + 1}
                {needsCasting && <span className="text-amber-500 ml-px">●</span>}
              </span>
              <span className={cn(
                "truncate",
                mName ? "text-blue-700" : !s.maleAvailable ? "text-red-500 font-medium" : "text-gray-300"
              )}>
                {mName || (!s.maleAvailable ? "불가" : "─")}
              </span>
              <span className="text-gray-300">/</span>
              <span className={cn(
                "truncate",
                fName ? "text-pink-700" : !s.femaleAvailable ? "text-red-500 font-medium" : "text-gray-300"
              )}>
                {fName || (!s.femaleAvailable ? "불가" : "─")}
              </span>
            </div>
          );
        })}
        <div className="mt-1 flex flex-wrap gap-0.5">
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
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-500">스케줄 불러오는 중...</div>
      </div>
    );
  }

  return (
    <>
      <ScheduleCalendar
        year={year}
        month={month}
        onMonthChange={handleMonthChange}
        renderCell={renderCell}
        onCellClick={handleCellClick}
      />
      {data?.reservationCheckedAt && (
        <p className="text-xs text-gray-400 text-center mt-1">
          예약 현황: {formatDistanceToNow(new Date(data.reservationCheckedAt), { addSuffix: true, locale: ko })}
        </p>
      )}

      {/* 배역 배정 Dialog */}
      <Dialog open={!!selectedDate} onOpenChange={(open) => {
        if (!open) {
          dialogCloseRef.current = Date.now();
          setSelectedDate(null);
        }
      }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedDate} 배역 배정</DialogTitle>
          </DialogHeader>

          {selectedDate && data?.performances[selectedDate] && (
            <div className="space-y-4">
              {data.performances[selectedDate].map((perf) => {
                const hasReservationData = data.reservations && Object.keys(data.reservations).length > 0;
                const reservationState = hasReservationData ? data.reservations![perf.id] : undefined;
                const noReservation = reservationState === false;

                return (
                  <div key={perf.id} className={cn(
                    "rounded-lg border p-3 space-y-2",
                    noReservation && "bg-gray-50 border-dashed"
                  )}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {SHOW_TIME_LABELS[perf.startTime as keyof typeof SHOW_TIME_LABELS] || perf.startTime}
                      </span>
                      {hasReservationData && (
                        reservationState === true
                          ? <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 border-green-300" variant="outline">예약</Badge>
                          : reservationState === false
                            ? <Badge className="text-[10px] px-1.5 py-0 bg-red-50 text-red-500 border-red-200" variant="outline">예약 없음</Badge>
                            : <Badge className="text-[10px] px-1.5 py-0 bg-gray-50 text-gray-400 border-gray-200" variant="outline">미확인</Badge>
                      )}
                    </div>

                    {(["MALE_LEAD", "FEMALE_LEAD"] as const).map((roleType) => {
                      const key = `${perf.id}_${roleType}`;
                      const available = getAvailableActors(perf.id, roleType);
                      const currentValue = dialogCastings[key] || "";

                      return (
                        <div key={roleType} className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "w-8 text-xs font-medium",
                              roleType === "MALE_LEAD" ? "text-blue-700" : "text-pink-700"
                            )}>
                              {ROLE_TYPE_LABEL[roleType]}
                            </span>
                            <Select
                              value={currentValue}
                              onValueChange={(v) =>
                                setDialogCastings((prev) => ({ ...prev, [key]: v }))
                              }
                              disabled={noReservation}
                            >
                              <SelectTrigger className={cn("flex-1 h-8 text-xs", noReservation && "opacity-50")}>
                                <SelectValue placeholder="미배정" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">
                                  <span className="text-gray-400">미배정</span>
                                </SelectItem>
                                {available.map((actor) => (
                                  <SelectItem key={actor.id} value={actor.id}>
                                    {actor.name}
                                    <span className="ml-1 text-gray-400">
                                      ({getActorCastingCount(actor.id)}회)
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {roleType === "MALE_LEAD" && (
                            <div className="ml-10 flex items-center gap-1.5">
                              <Input
                                placeholder="예약자명"
                                value={dialogMemos[perf.id]?.name || ""}
                                onChange={(e) =>
                                  setDialogMemos((prev) => ({
                                    ...prev,
                                    [perf.id]: {
                                      ...prev[perf.id],
                                      name: e.target.value,
                                    },
                                  }))
                                }
                                className="h-7 text-xs flex-1"
                                disabled={noReservation}
                              />
                              <Input
                                placeholder="연락처"
                                value={dialogMemos[perf.id]?.contact || ""}
                                onChange={(e) =>
                                  setDialogMemos((prev) => ({
                                    ...prev,
                                    [perf.id]: {
                                      ...prev[perf.id],
                                      contact: e.target.value,
                                    },
                                  }))
                                }
                                className="h-7 text-xs flex-1"
                                disabled={noReservation}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNotify}
              disabled={notifying || saving}
              className="sm:mr-auto text-xs"
            >
              {notifying ? "발송 중..." : "알림 재발송"}
            </Button>
            <Button variant="outline" onClick={() => setSelectedDate(null)}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

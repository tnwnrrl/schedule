"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

interface ScheduleData {
  performances: Record<string, Performance[]>;
  castings: Record<string, { actorId: string; actorName: string }>;
  unavailable: Record<string, string[]>;
  actors: Actor[];
}

export function CastingCalendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dialogCastings, setDialogCastings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
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
    for (const p of perfs) {
      for (const roleType of ["MALE_LEAD", "FEMALE_LEAD"]) {
        const key = `${p.id}_${roleType}`;
        const casting = data.castings[key];
        initial[key] = casting?.actorId || "";
      }
    }
    setDialogCastings(initial);
  };

  const handleSave = async () => {
    if (!data || !selectedDate) return;
    setSaving(true);

    const perfs = data.performances[selectedDate];
    const changes: Array<{ performanceDateId: string; roleType: string; actorId: string | null }> = [];

    for (const p of perfs) {
      for (const roleType of ["MALE_LEAD", "FEMALE_LEAD"]) {
        const key = `${p.id}_${roleType}`;
        const raw = dialogCastings[key];
        const newActorId = raw && raw !== "__none__" ? raw : null;
        const oldActorId = data.castings[key]?.actorId || null;
        if (newActorId !== oldActorId) {
          changes.push({ performanceDateId: p.id, roleType, actorId: newActorId });
        }
      }
    }

    if (changes.length === 0) {
      setSelectedDate(null);
      setSaving(false);
      return;
    }

    try {
      for (const change of changes) {
        const res = await fetch("/api/casting", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(change),
        });
        if (!res.ok) {
          const err = await res.json();
          toast.error(err.error || "배정 실패");
          setSaving(false);
          return;
        }
      }
      toast.success(`${changes.length}건 배정 완료`);
      setSelectedDate(null);
      await fetchData(year, month);
    } catch {
      toast.error("저장 실패");
    } finally {
      setSaving(false);
    }
  };

  // 배우별 배정 횟수 계산
  const getActorCastingCount = (actorId: string): number => {
    if (!data) return 0;
    return Object.values(data.castings).filter((c) => c.actorId === actorId).length;
  };

  // 특정 회차에 불가일정인 배우 필터
  const getAvailableActors = (perfId: string, roleType: string): Actor[] => {
    if (!data) return [];
    return data.actors
      .filter((a) => a.roleType === roleType)
      .filter((a) => {
        const unavailIds = data.unavailable[a.id] || [];
        return !unavailIds.includes(perfId);
      });
  };

  const renderCell = (dateStr: string) => {
    if (!data) return null;
    const perfs = data.performances[dateStr];
    if (!perfs || perfs.length === 0) return null;

    const slots = perfs.map((p) => {
      const male = data.castings[`${p.id}_MALE_LEAD`];
      const female = data.castings[`${p.id}_FEMALE_LEAD`];
      return { startTime: p.startTime, male, female };
    });

    // 요약: 배정된 슬롯 수
    const filled = slots.reduce((acc, s) => acc + (s.male ? 1 : 0) + (s.female ? 1 : 0), 0);
    const total = slots.length * 2;

    return (
      <div className="space-y-0.5">
        {slots.map((s, i) => {
          const mName = s.male?.actorName;
          const fName = s.female?.actorName;
          const hasBoth = mName && fName;
          return (
            <div key={i} className="flex items-center gap-0.5 leading-tight">
              <span className="text-[10px] text-gray-400 w-3 shrink-0">{i + 1}</span>
              <span className={cn("truncate", mName ? "text-blue-700" : "text-gray-300")}>
                {mName || "─"}
              </span>
              <span className="text-gray-300">/</span>
              <span className={cn("truncate", fName ? "text-pink-700" : "text-gray-300")}>
                {fName || "─"}
              </span>
            </div>
          );
        })}
        <div className="mt-1">
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
              {data.performances[selectedDate].map((perf) => (
                <div key={perf.id} className="rounded-lg border p-3 space-y-2">
                  <div className="font-medium text-sm">
                    {SHOW_TIME_LABELS[perf.startTime as keyof typeof SHOW_TIME_LABELS] || perf.startTime}
                  </div>

                  {(["MALE_LEAD", "FEMALE_LEAD"] as const).map((roleType) => {
                    const key = `${perf.id}_${roleType}`;
                    const available = getAvailableActors(perf.id, roleType);
                    const currentValue = dialogCastings[key] || "";

                    return (
                      <div key={roleType} className="flex items-center gap-2">
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
                        >
                          <SelectTrigger className="flex-1 h-8 text-xs">
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
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
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

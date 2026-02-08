"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ScheduleCalendar } from "@/components/schedule-calendar";
import { SHOW_TIME_LABELS } from "@/lib/constants";
import type { ShowTime } from "@/lib/constants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface UnavailableCalendarProps {
  actorId: string;
  initialPerformanceDateIds: string[];
}

interface Performance {
  id: string;
  startTime: string;
  label: string | null;
}

interface ScheduleData {
  performances: Record<string, Performance[]>;
  castings: Record<string, { actorId: string; actorName: string }>;
  unavailable: Record<string, string[]>; // actorId → performanceDateId[]
  actors: Array<{ id: string; name: string; roleType: string }>;
}

export function UnavailableCalendar({ actorId, initialPerformanceDateIds }: UnavailableCalendarProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialPerformanceDateIds));
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [dialogDate, setDialogDate] = useState<string | null>(null);
  const dialogCloseRef = useRef(0);

  const fetchData = useCallback(async (y: number, m: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/schedule?year=${y}&month=${m}`);
      if (!res.ok) {
        toast.error("일정을 불러오는데 실패했습니다");
        return;
      }
      const json: ScheduleData = await res.json();
      setData(json);
      // 서버에서 받은 불가일정으로 갱신
      const serverIds = json.unavailable[actorId] || [];
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of serverIds) {
          next.add(id);
        }
        return next;
      });
    } catch (e) {
      console.error("Schedule fetch error:", e);
      toast.error("일정을 불러오는데 실패했습니다");
    } finally {
      setLoading(false);
    }
  }, [actorId]);

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
    setDialogDate(dateStr);
  };

  const handleToggleSlot = (perfId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(perfId)) {
        next.delete(perfId);
      } else {
        next.add(perfId);
      }
      return next;
    });
    setDirty(true);
  };

  const handleToggleAll = (dateStr: string) => {
    if (!data) return;
    const perfs = data.performances[dateStr];
    if (!perfs) return;

    const allSelected = perfs.every((p) => selectedIds.has(p.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const p of perfs) {
        if (allSelected) {
          next.delete(p.id);
        } else {
          next.add(p.id);
        }
      }
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/unavailable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorId,
          performanceDateIds: Array.from(selectedIds),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "저장 실패");
        return;
      }
      toast.success("불가일정이 저장되었습니다");
      setDirty(false);
    } catch {
      toast.error("저장 실패");
    } finally {
      setSaving(false);
    }
  };

  // 해당 날짜에 내가 배정된 회차 ID 목록
  const getAssignedPerfIds = (dateStr: string): Set<string> => {
    if (!data) return new Set();
    const perfs = data.performances[dateStr];
    if (!perfs) return new Set();
    const assigned = new Set<string>();
    for (const p of perfs) {
      const maleKey = `${p.id}_MALE_LEAD`;
      const femaleKey = `${p.id}_FEMALE_LEAD`;
      if (
        data.castings[maleKey]?.actorId === actorId ||
        data.castings[femaleKey]?.actorId === actorId
      ) {
        assigned.add(p.id);
      }
    }
    return assigned;
  };

  const renderCell = (dateStr: string) => {
    if (!data) return null;
    const perfs = data.performances[dateStr];
    if (!perfs || perfs.length === 0) return null;

    const unavailCount = perfs.filter((p) => selectedIds.has(p.id)).length;
    const total = perfs.length;

    if (unavailCount === 0) return null;

    const isAllUnavail = unavailCount === total;

    return (
      <div
        className={cn(
          "flex h-full min-h-[40px] items-center justify-center rounded transition-colors",
          isAllUnavail ? "bg-red-100" : "bg-orange-50"
        )}
      >
        <span className={cn(
          "font-medium text-[11px]",
          isAllUnavail ? "text-red-600" : "text-orange-600"
        )}>
          {isAllUnavail ? "전체 불가" : `${unavailCount}/${total} 불가`}
        </span>
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

  const dialogPerfs = dialogDate ? data?.performances[dialogDate] : null;
  const dialogAssigned = dialogDate ? getAssignedPerfIds(dialogDate) : new Set<string>();
  const dialogAllSelected = dialogPerfs?.every((p) => selectedIds.has(p.id)) ?? false;

  return (
    <div className="space-y-4">
      <ScheduleCalendar
        year={year}
        month={month}
        onMonthChange={handleMonthChange}
        renderCell={renderCell}
        onCellClick={handleCellClick}
      />

      <div className="flex items-center justify-between rounded-lg border bg-white p-4">
        <div className="text-sm text-gray-600">
          {selectedIds.size}회차 불가일정 선택됨
          {dirty && <span className="ml-2 text-orange-500">(변경사항 있음)</span>}
        </div>
        <Button onClick={handleSave} disabled={saving || !dirty}>
          {saving ? "저장 중..." : "저장"}
        </Button>
      </div>

      {/* 회차 선택 Dialog */}
      <Dialog open={!!dialogDate} onOpenChange={(open) => {
        if (!open) {
          dialogCloseRef.current = Date.now();
          setDialogDate(null);
        }
      }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{dialogDate} 불가 회차 선택</DialogTitle>
          </DialogHeader>

          {dialogPerfs && (
            <div className="space-y-2">
              {/* 전체 선택/해제 */}
              <label className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={dialogAllSelected}
                  onChange={() => handleToggleAll(dialogDate!)}
                  className="h-4 w-4 rounded border-gray-300 accent-red-600"
                />
                <span className="font-medium text-sm">전체 선택/해제</span>
              </label>

              <div className="border-t my-2" />

              {dialogPerfs.map((perf) => {
                const isChecked = selectedIds.has(perf.id);
                const isAssigned = dialogAssigned.has(perf.id);
                const label = SHOW_TIME_LABELS[perf.startTime as ShowTime] || perf.startTime;

                return (
                  <label
                    key={perf.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-gray-50",
                      isChecked && "bg-red-50 border-red-200"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleSlot(perf.id)}
                      className="h-4 w-4 rounded border-gray-300 accent-red-600"
                    />
                    <span className={cn("text-sm", isChecked && "text-red-700 font-medium")}>
                      {label}
                    </span>
                    {isAssigned && (
                      <span className="ml-auto text-[10px] text-orange-500 font-medium">
                        배정됨
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogDate(null)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

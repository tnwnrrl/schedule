"use client";

import { useState, useEffect, useCallback } from "react";
import { ScheduleCalendar } from "@/components/schedule-calendar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface UnavailableCalendarProps {
  actorId: string;
  initialDates: string[];
}

interface ScheduleData {
  performances: Record<string, Array<{ id: string; startTime: string; label: string | null }>>;
  castings: Record<string, { actorId: string; actorName: string }>;
  unavailable: Record<string, string[]>;
  actors: Array<{ id: string; name: string; roleType: string }>;
}

export function UnavailableCalendar({ actorId, initialDates }: UnavailableCalendarProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set(initialDates));
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

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
      const serverDates = json.unavailable[actorId] || [];
      setSelectedDates((prev) => {
        const next = new Set(prev);
        for (const d of serverDates) {
          next.add(d);
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
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) {
        next.delete(dateStr);
      } else {
        next.add(dateStr);
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
          dates: Array.from(selectedDates),
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

  // 해당 날짜에 내가 배정된 회차가 있는지 확인
  const hasAssignment = (dateStr: string): boolean => {
    if (!data) return false;
    const perfs = data.performances[dateStr];
    if (!perfs) return false;
    return perfs.some((p) => {
      const maleKey = `${p.id}_MALE_LEAD`;
      const femaleKey = `${p.id}_FEMALE_LEAD`;
      return (
        data.castings[maleKey]?.actorId === actorId ||
        data.castings[femaleKey]?.actorId === actorId
      );
    });
  };

  const renderCell = (dateStr: string) => {
    const isSelected = selectedDates.has(dateStr);
    const assigned = hasAssignment(dateStr);

    return (
      <div
        className={cn(
          "flex h-full min-h-[40px] items-center justify-center rounded transition-colors",
          isSelected && "bg-red-100"
        )}
      >
        {isSelected && (
          <span className="text-red-600 font-medium">불가</span>
        )}
        {assigned && isSelected && (
          <span className="text-orange-500 text-[10px] block">⚠️ 배정됨</span>
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
          {selectedDates.size}일 불가일정 선택됨
          {dirty && <span className="ml-2 text-orange-500">(변경사항 있음)</span>}
        </div>
        <Button onClick={handleSave} disabled={saving || !dirty}>
          {saving ? "저장 중..." : "저장"}
        </Button>
      </div>
    </div>
  );
}

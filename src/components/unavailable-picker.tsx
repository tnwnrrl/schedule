"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";

interface PerformanceDate {
  date: string;
  startTime: string;
  label?: string | null;
}

interface UnavailablePickerProps {
  actorId: string;
  initialDates: string[];
  performanceDates: PerformanceDate[];
}

export function UnavailablePicker({
  actorId,
  initialDates,
  performanceDates,
}: UnavailablePickerProps) {
  const [selectedDates, setSelectedDates] = useState<Set<string>>(
    new Set(initialDates)
  );
  const [isPending, startTransition] = useTransition();
  const [isSaved, setIsSaved] = useState(true);

  // 공연 날짜만 추출 (중복 제거)
  const uniqueDates = [
    ...new Set(performanceDates.map((p) => p.date)),
  ].sort();

  const toggleDate = (date: string) => {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
    setIsSaved(false);
  };

  const handleSave = () => {
    startTransition(async () => {
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
          const data = await res.json();
          throw new Error(data.error || "저장 실패");
        }

        setIsSaved(true);
        toast.success("불가일정이 저장되었습니다");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "저장 중 오류가 발생했습니다"
        );
      }
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>공연 날짜 선택</CardTitle>
          <p className="text-sm text-gray-600">
            출연이 불가능한 날짜를 클릭하세요 (빨간색 = 불가)
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {uniqueDates.map((date) => {
              const isSelected = selectedDates.has(date);
              const perfsOnDate = performanceDates.filter(
                (p) => p.date === date
              );
              return (
                <button
                  key={date}
                  onClick={() => toggleDate(date)}
                  className={`flex flex-col items-start rounded-lg border p-3 text-left transition-colors ${
                    isSelected
                      ? "border-red-300 bg-red-50 text-red-900"
                      : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}
                >
                  <span className="font-medium">
                    {format(new Date(date), "M/d (EEE)", { locale: ko })}
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {perfsOnDate.map((p, i) => (
                      <Badge
                        key={i}
                        variant={isSelected ? "destructive" : "secondary"}
                        className="text-xs"
                      >
                        {p.startTime}
                        {p.label && ` ${p.label}`}
                      </Badge>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-4">
        <Button onClick={handleSave} disabled={isPending || isSaved}>
          {isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : isSaved ? (
            <Check className="mr-2 h-4 w-4" />
          ) : null}
          {isPending ? "저장 중..." : isSaved ? "저장됨" : "저장"}
        </Button>
        <span className="text-sm text-gray-500">
          {selectedDates.size}일 불가일정 선택됨
        </span>
      </div>
    </div>
  );
}

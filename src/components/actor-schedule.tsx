"use client";

import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_TYPE_LABEL } from "@/types";
import type { RoleType } from "@/types";
import { CalendarDays, Ban } from "lucide-react";

interface CastingItem {
  id: string;
  roleType: string;
  date: string;
  startTime: string;
  endTime?: string | null;
  label?: string | null;
}

interface ActorScheduleProps {
  castings: CastingItem[];
  unavailableDates: string[];
}

export function ActorSchedule({
  castings,
  unavailableDates,
}: ActorScheduleProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            배정된 공연 ({castings.length}회)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {castings.length === 0 ? (
            <p className="text-sm text-gray-500">배정된 공연이 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {castings.map((casting) => (
                <div
                  key={casting.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <div className="font-medium">
                      {format(new Date(casting.date), "M/d (EEE)", {
                        locale: ko,
                      })}
                    </div>
                    <div className="text-sm text-gray-600">
                      {casting.startTime}
                      {casting.endTime && `~${casting.endTime}`}
                      {casting.label && ` (${casting.label})`}
                    </div>
                  </div>
                  <Badge variant="secondary">
                    {ROLE_TYPE_LABEL[casting.roleType as RoleType] ??
                      casting.roleType}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5" />
            불가일정 ({unavailableDates.length}일)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {unavailableDates.length === 0 ? (
            <p className="text-sm text-gray-500">
              등록된 불가일정이 없습니다.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {unavailableDates.map((date) => (
                <Badge key={date} variant="destructive">
                  {format(new Date(date), "M/d (EEE)", { locale: ko })}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

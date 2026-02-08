"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ROLE_TYPE_LABEL } from "@/types";
import type { RoleType } from "@/types";

interface Performance {
  id: string;
  date: string;
  startTime: string;
  endTime?: string | null;
  label?: string | null;
}

interface Actor {
  id: string;
  name: string;
  roleType: string;
}

interface CastingTableProps {
  performances: Performance[];
  actors: Actor[];
  castingMap: Record<string, { actorId: string; actorName: string }>;
  unavailableMap: Record<string, string[]>;
}

const ROLE_TYPES: RoleType[] = ["MALE_LEAD", "FEMALE_LEAD"];

export function CastingTable({
  performances,
  actors,
  castingMap: initialCastingMap,
  unavailableMap,
}: CastingTableProps) {
  const [castingMap, setCastingMap] = useState(initialCastingMap);
  const [isPending, startTransition] = useTransition();

  const getAvailableActors = (
    perfDate: string,
    roleType: string
  ): Actor[] => {
    const dateStr = new Date(perfDate).toISOString().split("T")[0];
    return actors.filter((actor) => {
      if (actor.roleType !== roleType) return false;
      const unavailable = unavailableMap[actor.id] || [];
      return !unavailable.includes(dateStr);
    });
  };

  const handleCastingChange = (
    performanceDateId: string,
    roleType: string,
    actorId: string
  ) => {
    const key = `${performanceDateId}_${roleType}`;

    startTransition(async () => {
      try {
        const res = await fetch("/api/casting", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            performanceDateId,
            roleType,
            actorId: actorId === "none" ? null : actorId,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "배정 실패");
        }

        if (actorId === "none") {
          setCastingMap((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
          toast.success("배정이 해제되었습니다");
        } else {
          const actor = actors.find((a) => a.id === actorId);
          setCastingMap((prev) => ({
            ...prev,
            [key]: { actorId, actorName: actor?.name || "" },
          }));
          toast.success(`${actor?.name} 배정 완료`);
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "배정 중 오류가 발생했습니다"
        );
      }
    });
  };

  // Count castings per actor
  const actorCastingCount: Record<string, number> = {};
  for (const value of Object.values(castingMap)) {
    actorCastingCount[value.actorId] =
      (actorCastingCount[value.actorId] || 0) + 1;
  }

  return (
    <div className="rounded-lg border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">공연일</TableHead>
            {ROLE_TYPES.map((rt) => (
              <TableHead key={rt}>{ROLE_TYPE_LABEL[rt]}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {performances.map((perf) => (
            <TableRow key={perf.id}>
              <TableCell>
                <div className="font-medium">
                  {format(new Date(perf.date), "M/d (EEE)", { locale: ko })}
                </div>
                <div className="text-sm text-gray-500">
                  {perf.startTime}
                  {perf.endTime && `~${perf.endTime}`}
                  {perf.label && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      {perf.label}
                    </Badge>
                  )}
                </div>
              </TableCell>
              {ROLE_TYPES.map((roleType) => {
                const key = `${perf.id}_${roleType}`;
                const current = castingMap[key];
                const available = getAvailableActors(perf.date, roleType);

                return (
                  <TableCell key={roleType}>
                    <Select
                      value={current?.actorId || "none"}
                      onValueChange={(value) =>
                        handleCastingChange(perf.id, roleType, value)
                      }
                      disabled={isPending}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue>
                          {current ? (
                            <span>
                              {current.actorName}
                              <span className="ml-1 text-xs text-gray-400">
                                ({actorCastingCount[current.actorId] || 0}회)
                              </span>
                            </span>
                          ) : (
                            <span className="text-gray-400">미배정</span>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">미배정</SelectItem>
                        {available.map((actor) => (
                          <SelectItem key={actor.id} value={actor.id}>
                            {actor.name}
                            <span className="ml-1 text-xs text-gray-400">
                              ({actorCastingCount[actor.id] || 0}회)
                            </span>
                          </SelectItem>
                        ))}
                        {available.length === 0 && (
                          <div className="px-2 py-1.5 text-sm text-gray-500">
                            가용 배우 없음
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

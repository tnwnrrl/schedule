"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { ROLE_TYPE_LABEL } from "@/types";
import type { RoleType } from "@/types";
import { SHOW_TIME_LABELS } from "@/lib/constants";
import type { ShowTime } from "@/lib/constants";
import { Plus, Pencil, Trash2, Link as LinkIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";

interface ActorData {
  id: string;
  name: string;
  roleType: string;
  calendarId?: string | null;
  linkedUser: { id: string; email: string | null; name: string | null } | null;
  castingCount: number;
  unavailableCount: number;
}

interface UserData {
  id: string;
  email: string | null;
  name: string | null;
}

interface ActorManagerProps {
  initialActors: ActorData[];
  unlinkedUsers: UserData[];
}

export function ActorManager({
  initialActors,
  unlinkedUsers,
}: ActorManagerProps) {
  const [actors, setActors] = useState(initialActors);
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingActor, setEditingActor] = useState<ActorData | null>(null);
  const [formName, setFormName] = useState("");
  const [formRoleType, setFormRoleType] = useState<string>("MALE_LEAD");
  const [formEmail, setFormEmail] = useState("");
  const router = useRouter();

  // 월별 불가일정
  const now = new Date();
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1);
  const [monthlyUnavailable, setMonthlyUnavailable] = useState<Record<string, number>>({});
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  // 불가일정 상세 보기용 데이터
  const [perfIdToInfo, setPerfIdToInfo] = useState<Record<string, { date: string; startTime: string }>>({});
  const [unavailableRaw, setUnavailableRaw] = useState<Record<string, string[]>>({});
  const [detailActor, setDetailActor] = useState<ActorData | null>(null);

  const fetchMonthlyData = useCallback(async (y: number, m: number) => {
    setMonthlyLoading(true);
    try {
      const res = await fetch(`/api/schedule?year=${y}&month=${m}`);
      if (!res.ok) return;
      const data = await res.json();
      const performances: Record<string, Array<{ id: string; startTime: string }>> = data.performances || {};
      const unavail: Record<string, string[]> = data.unavailable || {};

      // performanceDateId → { date, startTime } 역매핑
      const idMap: Record<string, { date: string; startTime: string }> = {};
      for (const [dateStr, perfs] of Object.entries(performances)) {
        for (const p of perfs) {
          idMap[p.id] = { date: dateStr, startTime: p.startTime };
        }
      }
      setPerfIdToInfo(idMap);
      setUnavailableRaw(unavail);

      const counts: Record<string, number> = {};
      for (const [actorId, perfIds] of Object.entries(unavail)) {
        counts[actorId] = (perfIds as string[]).length;
      }
      setMonthlyUnavailable(counts);
    } catch {
      // silent
    } finally {
      setMonthlyLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMonthlyData(filterYear, filterMonth);
  }, [filterYear, filterMonth, fetchMonthlyData]);

  const handlePrevMonth = () => {
    if (filterMonth === 1) {
      setFilterYear((y) => y - 1);
      setFilterMonth(12);
    } else {
      setFilterMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (filterMonth === 12) {
      setFilterYear((y) => y + 1);
      setFilterMonth(1);
    } else {
      setFilterMonth((m) => m + 1);
    }
  };

  const openAddDialog = () => {
    setEditingActor(null);
    setFormName("");
    setFormRoleType("MALE_LEAD");
    setDialogOpen(true);
  };

  const openEditDialog = (actor: ActorData) => {
    setEditingActor(actor);
    setFormName(actor.name);
    setFormRoleType(actor.roleType);
    setFormEmail(actor.linkedUser?.email || "");
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!formName.trim()) {
      toast.error("이름을 입력해주세요");
      return;
    }

    startTransition(async () => {
      try {
        if (editingActor) {
          const res = await fetch(`/api/actors/${editingActor.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: formName,
              roleType: formRoleType,
              ...(editingActor.linkedUser && { userEmail: formEmail || null }),
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => null);
            throw new Error(err?.error || "수정 실패");
          }
          toast.success("배우 정보가 수정되었습니다");
        } else {
          const res = await fetch("/api/actors", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: formName, roleType: formRoleType }),
          });
          if (!res.ok) throw new Error("추가 실패");
          toast.success("배우가 추가되었습니다");
        }
        setDialogOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "오류가 발생했습니다"
        );
      }
    });
  };

  const handleDelete = (actor: ActorData) => {
    if (
      !confirm(
        `${actor.name}을(를) 삭제하시겠습니까? 관련 배정과 불가일정도 모두 삭제됩니다.`
      )
    ) {
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/actors/${actor.id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("삭제 실패");
        setActors((prev) => prev.filter((a) => a.id !== actor.id));
        toast.success("배우가 삭제되었습니다");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "삭제 중 오류가 발생했습니다"
        );
      }
    });
  };

  const handleLinkUser = (actorId: string, userId: string) => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/actors/${actorId}/link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });
        if (!res.ok) throw new Error("연결 실패");
        toast.success("계정이 연결되었습니다");
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "연결 중 오류가 발생했습니다"
        );
      }
    });
  };

  const maleActors = actors.filter((a) => a.roleType === "MALE_LEAD");
  const femaleActors = actors.filter((a) => a.roleType === "FEMALE_LEAD");

  return (
    <div className="space-y-4">
      {/* 월 선택기 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">불가일정 기준:</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handlePrevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium w-24 text-center">
              {filterYear}년 {filterMonth}월
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openAddDialog}>
              <Plus className="mr-2 h-4 w-4" />
              배우 추가
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingActor ? "배우 수정" : "배우 추가"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">이름</Label>
                <Input
                  id="name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="배우 이름"
                />
              </div>
              <div>
                <Label htmlFor="roleType">역할</Label>
                <Select value={formRoleType} onValueChange={setFormRoleType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE_LEAD">남1 (남자 주연)</SelectItem>
                    <SelectItem value="FEMALE_LEAD">
                      여1 (여자 주연)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editingActor?.linkedUser && (
                <div>
                  <Label htmlFor="email">계정 이메일</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="연결된 계정 이메일"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    연결된 Google 계정의 이메일을 수정합니다
                  </p>
                </div>
              )}
              <Button
                onClick={handleSave}
                disabled={isPending}
                className="w-full"
              >
                {editingActor ? "수정" : "추가"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {[
        { label: "남1 (남자 주연)", actors: maleActors },
        { label: "여1 (여자 주연)", actors: femaleActors },
      ].map((group) => (
        <div key={group.label} className="rounded-lg border bg-white">
          <div className="border-b px-4 py-3">
            <h3 className="font-semibold">{group.label}</h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>연결된 계정</TableHead>
                <TableHead className="text-center">배정</TableHead>
                <TableHead className="text-center">
                  불가 ({filterMonth}월)
                </TableHead>
                <TableHead className="w-[120px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.actors.map((actor) => (
                <TableRow key={actor.id}>
                  <TableCell className="font-medium">{actor.name}</TableCell>
                  <TableCell>
                    {actor.linkedUser ? (
                      <Badge variant="secondary">
                        {actor.linkedUser.email}
                      </Badge>
                    ) : unlinkedUsers.length > 0 ? (
                      <Select
                        onValueChange={(userId) =>
                          handleLinkUser(actor.id, userId)
                        }
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="계정 연결..." />
                        </SelectTrigger>
                        <SelectContent>
                          {unlinkedUsers.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.email || user.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-sm text-gray-400">미연결</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {actor.castingCount}
                  </TableCell>
                  <TableCell className="text-center">
                    {monthlyLoading ? "..." : (
                      <button
                        className="underline decoration-dotted underline-offset-2 text-gray-700 hover:text-blue-600 transition-colors"
                        onClick={() => setDetailActor(actor)}
                      >
                        {monthlyUnavailable[actor.id] ?? 0}
                      </button>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(actor)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(actor)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {group.actors.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-gray-500"
                  >
                    등록된 배우가 없습니다
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      ))}

      {/* 불가일정 상세 Dialog */}
      <Dialog open={!!detailActor} onOpenChange={(open) => { if (!open) setDetailActor(null); }}>
        <DialogContent className="sm:max-w-md max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detailActor?.name} — {filterYear}년 {filterMonth}월 불가일정
            </DialogTitle>
          </DialogHeader>
          {detailActor && (() => {
            const perfIds = unavailableRaw[detailActor.id] || [];
            const items = perfIds
              .map((pid) => perfIdToInfo[pid])
              .filter(Boolean)
              .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

            if (items.length === 0) {
              return <p className="text-sm text-gray-500 py-4 text-center">불가일정이 없습니다</p>;
            }

            // 날짜별 그룹핑
            const grouped: Record<string, string[]> = {};
            for (const item of items) {
              if (!grouped[item.date]) grouped[item.date] = [];
              grouped[item.date].push(item.startTime);
            }

            return (
              <div className="space-y-2">
                {Object.entries(grouped).map(([date, times]) => {
                  const d = new Date(date + "T00:00:00");
                  const dayOfWeek = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
                  const dateLabel = `${d.getMonth() + 1}/${d.getDate()} (${dayOfWeek})`;
                  return (
                    <div key={date} className="flex items-start gap-3 py-1.5 border-b last:border-0">
                      <span className="text-sm font-medium w-20 shrink-0">{dateLabel}</span>
                      <div className="flex flex-wrap gap-1">
                        {times.map((t) => (
                          <Badge key={t} variant="secondary" className="text-xs">
                            {SHOW_TIME_LABELS[t as ShowTime] || t}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-gray-400 pt-2 text-center">
                  총 {items.length}건
                </p>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
import { SHOW_TIME_LABELS, MINIMUM_WAGE, EXTRA_SHOW_RATE } from "@/lib/constants";
import type { ShowTime } from "@/lib/constants";
import { Plus, Pencil, Trash2, Link as LinkIcon, ChevronLeft, ChevronRight, Calendar, RefreshCw, Ban, Clock, X } from "lucide-react";
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

interface OvertimeEntry {
  id: string;
  actorId: string;
  date: string;
  type: string;
  hours: number;
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
  const [monthlyCasting, setMonthlyCasting] = useState<Record<string, number>>({});
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  // 불가일정 상세 보기용 데이터
  const [perfIdToInfo, setPerfIdToInfo] = useState<Record<string, { date: string; startTime: string }>>({});
  const [unavailableRaw, setUnavailableRaw] = useState<Record<string, string[]>>({});
  const [detailActor, setDetailActor] = useState<ActorData | null>(null);
  const [calendarSetup, setCalendarSetup] = useState(false);
  const [syncingActorId, setSyncingActorId] = useState<string | null>(null);
  const [overriddenActors, setOverriddenActors] = useState<Set<string>>(new Set());
  const [overrideLoading, setOverrideLoading] = useState<string | null>(null);
  // 추가근무
  const [overtimeEntries, setOvertimeEntries] = useState<OvertimeEntry[]>([]);
  const [overtimeDialog, setOvertimeDialog] = useState<{ actor: ActorData } | null>(null);
  const [overtimeForm, setOvertimeForm] = useState({ date: "", type: "EDUCATION", hours: "" });
  const [overtimeSubmitting, setOvertimeSubmitting] = useState(false);

  const fetchMonthlyData = useCallback(async (y: number, m: number) => {
    setMonthlyLoading(true);
    try {
      const [res, overtimeRes] = await Promise.all([
        fetch(`/api/schedule?year=${y}&month=${m}`),
        fetch(`/api/actors/overtime?year=${y}&month=${m}`),
      ]);
      if (!res.ok) return;
      const data = await res.json();
      if (overtimeRes.ok) {
        const entries: OvertimeEntry[] = await overtimeRes.json();
        setOvertimeEntries(entries);
      }
      const performances: Record<string, Array<{ id: string; startTime: string }>> = data.performances || {};
      const unavail: Record<string, string[]> = data.unavailable || {};
      const castings: Record<string, { actorId: string }> = data.castings || {};
      const overridden: string[] = data.overriddenActors || [];
      setOverriddenActors(new Set(overridden));

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

      // 월별 배정 수 집계
      const castingCounts: Record<string, number> = {};
      for (const c of Object.values(castings)) {
        castingCounts[c.actorId] = (castingCounts[c.actorId] || 0) + 1;
      }
      setMonthlyCasting(castingCounts);
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

  const handleSyncUnavailable = async (actor: ActorData) => {
    if (!actor.calendarId) {
      toast.error("캘린더가 연결되지 않은 배우입니다");
      return;
    }
    setSyncingActorId(actor.id);
    try {
      const res = await fetch(`/api/actors/${actor.id}/sync-unavailable`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "동기화 실패");
      if (data.total === 0) {
        toast.success(`${actor.name}: 동기화할 불가일정이 없습니다`);
      } else if (data.failed > 0) {
        toast.warning(`${actor.name}: ${data.synced}건 성공, ${data.failed}건 실패`);
      } else {
        toast.success(`${actor.name}: 불가일정 ${data.synced}건 동기화 완료`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "동기화 실패");
    } finally {
      setSyncingActorId(null);
    }
  };

  const handleToggleOverride = async (actor: ActorData) => {
    const isOverridden = overriddenActors.has(actor.id);
    const action = isOverridden ? "활성화" : "비활성화";
    if (!confirm(`${actor.name}을(를) ${filterYear}년 ${filterMonth}월에 ${action}하시겠습니까?`)) return;
    setOverrideLoading(actor.id);
    try {
      const res = await fetch("/api/actor-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId: actor.id, year: filterYear, month: filterMonth }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "실패");
      setOverriddenActors((prev) => {
        const next = new Set(prev);
        if (data.overridden) next.add(actor.id);
        else next.delete(actor.id);
        return next;
      });
      toast.success(`${actor.name}: ${filterMonth}월 배정 ${data.overridden ? "제외" : "포함"}됨`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "오류가 발생했습니다");
    } finally {
      setOverrideLoading(null);
    }
  };

  const handleCalendarSetup = async () => {
    if (!confirm("모든 배우의 개인 캘린더를 생성하고 공유하시겠습니까?")) return;
    setCalendarSetup(true);
    try {
      const res = await fetch("/api/actors/calendars", { method: "POST" });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || "캘린더 설정 실패");
      } else if (result.errors?.length) {
        toast.warning(`${result.message}\n${result.errors.join("\n")}`, { duration: 10000 });
      } else {
        toast.success(result.message);
      }
      router.refresh();
    } catch {
      toast.error("캘린더 설정 실패");
    } finally {
      setCalendarSetup(false);
    }
  };

  const handleAddOvertime = async () => {
    if (!overtimeDialog) return;
    if (!overtimeForm.date || !overtimeForm.hours) {
      toast.error("날짜와 시간을 입력해주세요");
      return;
    }
    const hours = parseFloat(overtimeForm.hours);
    if (isNaN(hours) || hours <= 0) {
      toast.error("올바른 시간을 입력해주세요");
      return;
    }
    setOvertimeSubmitting(true);
    try {
      const res = await fetch("/api/actors/overtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId: overtimeDialog.actor.id, date: overtimeForm.date, type: overtimeForm.type, hours }),
      });
      if (!res.ok) throw new Error("추가 실패");
      const entry: OvertimeEntry = await res.json();
      setOvertimeEntries((prev) => {
        const filtered = prev.filter((e) => !(e.actorId === entry.actorId && e.date === entry.date && e.type === entry.type));
        return [...filtered, entry];
      });
      setOvertimeForm((f) => ({ ...f, date: "", hours: "" }));
      toast.success("추가근무 항목이 등록되었습니다");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "오류가 발생했습니다");
    } finally {
      setOvertimeSubmitting(false);
    }
  };

  const handleDeleteOvertime = async (entryId: string) => {
    try {
      const res = await fetch(`/api/actors/overtime/${entryId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("삭제 실패");
      setOvertimeEntries((prev) => prev.filter((e) => e.id !== entryId));
      toast.success("삭제되었습니다");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제 실패");
    }
  };

  const getActorOvertimeSummary = (actorId: string) => {
    const entries = overtimeEntries.filter((e) => e.actorId === actorId);
    const educationHours = entries.filter((e) => e.type === "EDUCATION").reduce((s, e) => s + e.hours, 0);
    const extraShowHours = entries.filter((e) => e.type === "EXTRA_SHOW").reduce((s, e) => s + e.hours, 0);
    const wage = MINIMUM_WAGE[filterYear] ?? 10030;
    const pay = Math.round(educationHours * wage) + extraShowHours * EXTRA_SHOW_RATE;
    return { educationHours, extraShowHours, totalHours: educationHours + extraShowHours, pay };
  };

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    const dayOfWeek = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
    return `${d.getMonth() + 1}/${d.getDate()} (${dayOfWeek})`;
  };

  const maleActors = actors.filter((a) => a.roleType === "MALE_LEAD");
  const femaleActors = actors.filter((a) => a.roleType === "FEMALE_LEAD");

  return (
    <div className="space-y-4">
      {/* 월 선택기 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">조회 기준:</span>
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

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={handleCalendarSetup}
          disabled={calendarSetup}
        >
          <Calendar className="mr-2 h-4 w-4" />
          {calendarSetup ? "설정 중..." : "캘린더 일괄 생성"}
        </Button>
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
                <TableHead className="text-center">캘린더</TableHead>
                <TableHead className="text-center">
                  배정 ({filterMonth}월)
                </TableHead>
                <TableHead className="text-center">
                  불가 ({filterMonth}월)
                </TableHead>
                <TableHead className="text-center">
                  추가근무 ({filterMonth}월)
                </TableHead>
                <TableHead className="text-center">
                  {filterMonth}월 배정제외
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
                    {actor.calendarId ? (
                      <Badge variant="secondary" className="text-xs">연결됨</Badge>
                    ) : (
                      <span className="text-xs text-gray-400">없음</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {monthlyLoading ? "..." : (monthlyCasting[actor.id] ?? 0)}
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
                  <TableCell className="text-center">
                    {monthlyLoading ? "..." : (() => {
                      const summary = getActorOvertimeSummary(actor.id);
                      return (
                        <button
                          className="underline decoration-dotted underline-offset-2 text-gray-700 hover:text-purple-600 transition-colors flex items-center gap-1 justify-center mx-auto"
                          onClick={() => {
                            setOvertimeDialog({ actor });
                            setOvertimeForm({ date: "", type: "EDUCATION", hours: "" });
                          }}
                        >
                          <Clock className="h-3 w-3" />
                          {summary.totalHours > 0
                            ? `${summary.totalHours}h / ${(summary.pay / 10000).toLocaleString()}만`
                            : "—"}
                        </button>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant={overriddenActors.has(actor.id) ? "destructive" : "ghost"}
                      size="sm"
                      onClick={() => handleToggleOverride(actor)}
                      disabled={overrideLoading === actor.id || monthlyLoading}
                      title={overriddenActors.has(actor.id) ? `${filterMonth}월 배정 제외 중 (클릭하여 해제)` : `${filterMonth}월 배정에서 제외`}
                      className="h-7 px-2"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      <span className="ml-1 text-xs">
                        {overriddenActors.has(actor.id) ? "제외중" : "제외"}
                      </span>
                    </Button>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSyncUnavailable(actor)}
                        disabled={syncingActorId === actor.id || !actor.calendarId}
                        title={actor.calendarId ? "불가일정 캘린더 동기화" : "캘린더 미연결"}
                      >
                        <RefreshCw className={`h-4 w-4 text-blue-500 ${syncingActorId === actor.id ? "animate-spin" : ""}`} />
                      </Button>
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
                    colSpan={8}
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

      {/* 추가근무 관리 Dialog */}
      <Dialog open={!!overtimeDialog} onOpenChange={(open) => { if (!open) setOvertimeDialog(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {overtimeDialog?.actor.name} — {filterYear}년 {filterMonth}월 추가근무
            </DialogTitle>
          </DialogHeader>
          {overtimeDialog && (() => {
            const actorEntries = overtimeEntries
              .filter((e) => e.actorId === overtimeDialog.actor.id)
              .sort((a, b) => a.date.localeCompare(b.date));
            const educationHours = actorEntries.filter((e) => e.type === "EDUCATION").reduce((s, e) => s + e.hours, 0);
            const extraShowHours = actorEntries.filter((e) => e.type === "EXTRA_SHOW").reduce((s, e) => s + e.hours, 0);
            const wage = MINIMUM_WAGE[filterYear] ?? 10030;
            const educationPay = Math.round(educationHours * wage);
            const extraShowPay = extraShowHours * EXTRA_SHOW_RATE;

            return (
              <div className="space-y-4">
                {/* 항목 목록 */}
                {actorEntries.length > 0 ? (
                  <div className="space-y-1">
                    {actorEntries.map((entry) => (
                      <div key={entry.id} className="flex items-center gap-2 py-1.5 border-b last:border-0">
                        <span className="text-sm w-20 shrink-0">{formatDateLabel(entry.date)}</span>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {entry.type === "EDUCATION" ? "교육" : "추가공연"}
                        </Badge>
                        <span className="text-sm text-gray-700 flex-1">{entry.hours}h</span>
                        <button
                          onClick={() => handleDeleteOvertime(entry.id)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="삭제"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-2">항목이 없습니다</p>
                )}

                {/* 합계 */}
                {actorEntries.length > 0 && (
                  <div className="rounded-md bg-gray-50 p-3 space-y-1 text-sm">
                    {educationHours > 0 && (
                      <div className="flex justify-between text-gray-600">
                        <span>교육 {educationHours}h × {wage.toLocaleString()}원</span>
                        <span className="font-medium">{educationPay.toLocaleString()}원</span>
                      </div>
                    )}
                    {extraShowHours > 0 && (
                      <div className="flex justify-between text-gray-600">
                        <span>추가공연 {extraShowHours}h × {EXTRA_SHOW_RATE.toLocaleString()}원</span>
                        <span className="font-medium">{extraShowPay.toLocaleString()}원</span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                      <span>합계</span>
                      <span>{(educationPay + extraShowPay).toLocaleString()}원</span>
                    </div>
                  </div>
                )}

                {/* 입력 폼 */}
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label className="text-xs text-gray-500 mb-1 block">날짜</Label>
                    <Input
                      type="date"
                      value={overtimeForm.date}
                      onChange={(e) => setOvertimeForm((f) => ({ ...f, date: e.target.value }))}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="w-28">
                    <Label className="text-xs text-gray-500 mb-1 block">종류</Label>
                    <Select value={overtimeForm.type} onValueChange={(v) => setOvertimeForm((f) => ({ ...f, type: v }))}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EDUCATION">교육</SelectItem>
                        <SelectItem value="EXTRA_SHOW">추가공연</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-20">
                    <Label className="text-xs text-gray-500 mb-1 block">시간</Label>
                    <Input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={overtimeForm.hours}
                      onChange={(e) => setOvertimeForm((f) => ({ ...f, hours: e.target.value }))}
                      placeholder="0"
                      className="h-8 text-sm"
                    />
                  </div>
                  <Button
                    size="sm"
                    className="h-8 shrink-0"
                    onClick={handleAddOvertime}
                    disabled={overtimeSubmitting}
                  >
                    <Plus className="h-4 w-4" />
                    추가
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

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

"use client";

import { useState } from "react";
import type { AuditIssue, AuditIssueCode } from "@/app/api/calendar/audit/route";

type AuditSummary = {
  castingsChecked: number;
  unavailableChecked: number;
  issuesFound: number;
  durationMs: number;
};

type AuditResult = {
  summary: AuditSummary;
  issues: AuditIssue[];
};

const ISSUE_CODE_LABELS: Record<AuditIssueCode, string> = {
  NOT_SYNCED: "미동기화",
  SYNCED_NO_ID: "ID 없음",
  EVENT_MISSING: "이벤트 없음",
  SUMMARY_MISMATCH: "제목 불일치",
  TIME_MISMATCH: "시간 불일치",
  DESCRIPTION_MISMATCH: "설명 불일치",
  ALL_CAL_MISSING: "전체캘린더 없음",
};

const ISSUE_CODE_COLORS: Record<AuditIssueCode, string> = {
  NOT_SYNCED: "bg-yellow-100 text-yellow-800",
  SYNCED_NO_ID: "bg-orange-100 text-orange-800",
  EVENT_MISSING: "bg-red-100 text-red-800",
  SUMMARY_MISMATCH: "bg-blue-100 text-blue-800",
  TIME_MISMATCH: "bg-blue-100 text-blue-800",
  DESCRIPTION_MISMATCH: "bg-purple-100 text-purple-800",
  ALL_CAL_MISSING: "bg-gray-100 text-gray-800",
};

function getTodayStr() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split("T")[0];
}

function getDefaultDateRange() {
  const today = getTodayStr();
  const from = new Date(new Date(today).getTime() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const to = new Date(new Date(today).getTime() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  return { from, to };
}

export function CalendarAudit() {
  const defaults = getDefaultDateRange();
  const [fromDate, setFromDate] = useState(defaults.from);
  const [toDate, setToDate] = useState(defaults.to);
  const [checkAllCalendar, setCheckAllCalendar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAudit() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/calendar/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDate, toDate, checkAllCalendar }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data: AuditResult = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* 컨트롤 패널 */}
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">시작일</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">종료일</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={checkAllCalendar}
              onChange={(e) => setCheckAllCalendar(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span className="text-gray-700">전체배우캘린더도 검사</span>
          </label>
          <button
            onClick={handleAudit}
            disabled={loading}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "감사 중..." : "감사 시작"}
          </button>
        </div>
      </div>

      {/* 로딩 */}
      {loading && (
        <div className="flex items-center gap-3 rounded-lg border bg-white p-6 shadow-sm">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <span className="text-sm text-gray-600">Google Calendar API 조회 중... (시간이 걸릴 수 있습니다)</span>
        </div>
      )}

      {/* 오류 */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          오류: {error}
        </div>
      )}

      {/* 결과 */}
      {result && (
        <div className="space-y-4">
          {/* 요약 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border bg-white p-4 shadow-sm text-center">
              <div className="text-2xl font-bold text-gray-900">{result.summary.castingsChecked}</div>
              <div className="text-xs text-gray-500 mt-1">검사한 배정</div>
            </div>
            <div className="rounded-lg border bg-white p-4 shadow-sm text-center">
              <div className="text-2xl font-bold text-gray-900">{result.summary.unavailableChecked}</div>
              <div className="text-xs text-gray-500 mt-1">검사한 불가일정</div>
            </div>
            <div className={`rounded-lg border p-4 shadow-sm text-center ${result.summary.issuesFound > 0 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
              <div className={`text-2xl font-bold ${result.summary.issuesFound > 0 ? "text-red-700" : "text-green-700"}`}>
                {result.summary.issuesFound}
              </div>
              <div className={`text-xs mt-1 ${result.summary.issuesFound > 0 ? "text-red-600" : "text-green-600"}`}>발견된 문제</div>
            </div>
            <div className="rounded-lg border bg-white p-4 shadow-sm text-center">
              <div className="text-2xl font-bold text-gray-900">{(result.summary.durationMs / 1000).toFixed(1)}s</div>
              <div className="text-xs text-gray-500 mt-1">소요 시간</div>
            </div>
          </div>

          {/* 이슈 없음 */}
          {result.issues.length === 0 && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center text-green-800">
              <div className="text-lg font-medium">✓ 문제 없음</div>
              <div className="text-sm text-green-700 mt-1">모든 캘린더 이벤트가 DB와 일치합니다.</div>
            </div>
          )}

          {/* 이슈 테이블 */}
          {result.issues.length > 0 && (
            <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">날짜</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">배우</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">역할</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">문제</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">상세</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">DB 값</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">캘린더 값</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.issues.map((issue) => (
                      <tr key={`${issue.id}-${issue.issueCode}`} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-gray-900">
                          {issue.performanceDate}
                          {issue.startTime && (
                            <span className="ml-1 text-gray-500">{issue.startTime}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-900">{issue.actorName}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                          {issue.type === "unavailable"
                            ? "불가일정"
                            : issue.roleType === "MALE_LEAD"
                            ? "남1"
                            : issue.roleType === "FEMALE_LEAD"
                            ? "여1"
                            : issue.roleType}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ISSUE_CODE_COLORS[issue.issueCode]}`}>
                            {ISSUE_CODE_LABELS[issue.issueCode]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs">{issue.detail}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700 max-w-xs break-all">{issue.dbValue}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500 max-w-xs break-all">
                          {issue.calendarValue ?? "(없음)"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

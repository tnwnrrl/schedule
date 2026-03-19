export default function AdminLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
      <div className="space-y-4">
        {/* 통계 카드 3개 */}
        <div className="grid gap-4 grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="h-4 w-16 animate-pulse rounded bg-gray-200" />
                <div className="h-4 w-4 animate-pulse rounded bg-gray-200" />
              </div>
              <div className="h-8 w-24 animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-32 animate-pulse rounded bg-gray-200 mt-2" />
            </div>
          ))}
        </div>
        {/* 배우 테이블 */}
        <div className="rounded-xl border bg-white p-4">
          <div className="h-4 w-28 animate-pulse rounded bg-gray-200 mb-3" />
          <div className="grid gap-4 grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-8 animate-pulse rounded bg-gray-200" />
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="h-6 animate-pulse rounded bg-gray-100" />
                ))}
              </div>
            ))}
          </div>
        </div>
        {/* 캘린더 */}
        <div className="rounded-xl border bg-white p-4">
          <div className="h-4 w-20 animate-pulse rounded bg-gray-200 mb-4" />
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

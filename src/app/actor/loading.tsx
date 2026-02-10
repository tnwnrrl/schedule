export default function ActorLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-8 w-32 animate-pulse rounded bg-gray-200" />
        <div className="mt-2 h-5 w-24 animate-pulse rounded bg-gray-200" />
      </div>
      <div className="rounded-lg border bg-white p-6">
        <div className="mb-4 flex items-center justify-center gap-4">
          <div className="h-8 w-8 animate-pulse rounded bg-gray-200" />
          <div className="h-6 w-32 animate-pulse rounded bg-gray-200" />
          <div className="h-8 w-8 animate-pulse rounded bg-gray-200" />
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded bg-gray-100" />
          ))}
        </div>
      </div>
    </div>
  );
}

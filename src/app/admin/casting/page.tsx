import { prisma } from "@/lib/prisma";
import { CastingTable } from "@/components/casting-table";

export default async function CastingPage() {
  const [performances, actors, castings, unavailableDates] = await Promise.all([
    prisma.performanceDate.findMany({
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    prisma.actor.findMany({
      orderBy: [{ roleType: "asc" }, { name: "asc" }],
    }),
    prisma.casting.findMany({
      include: {
        actor: { select: { id: true, name: true, roleType: true } },
      },
    }),
    prisma.unavailableDate.findMany(),
  ]);

  // Build unavailable map: actorId -> Set<dateString>
  const unavailableMap: Record<string, string[]> = {};
  for (const u of unavailableDates) {
    const actorId = u.actorId;
    const dateStr = u.date.toISOString().split("T")[0];
    if (!unavailableMap[actorId]) unavailableMap[actorId] = [];
    unavailableMap[actorId].push(dateStr);
  }

  // Build casting map: performanceDateId_roleType -> casting
  const castingMap: Record<string, { actorId: string; actorName: string }> = {};
  for (const c of castings) {
    castingMap[`${c.performanceDateId}_${c.roleType}`] = {
      actorId: c.actor.id,
      actorName: c.actor.name,
    };
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">배역 배정</h1>
        <p className="text-gray-600">
          공연 날짜별로 배역을 배정하세요. 불가일정이 있는 배우는 드롭다운에
          표시되지 않습니다.
        </p>
      </div>
      <CastingTable
        performances={performances.map((p) => ({
          id: p.id,
          date: p.date.toISOString(),
          startTime: p.startTime,
          endTime: p.endTime,
          label: p.label,
        }))}
        actors={actors.map((a) => ({
          id: a.id,
          name: a.name,
          roleType: a.roleType,
        }))}
        castingMap={castingMap}
        unavailableMap={unavailableMap}
      />
    </div>
  );
}

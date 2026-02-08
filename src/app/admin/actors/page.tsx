import { prisma } from "@/lib/prisma";
import { ActorManager } from "@/components/actor-manager";

export default async function ActorsPage() {
  const actors = await prisma.actor.findMany({
    include: {
      user: { select: { id: true, email: true, name: true } },
      _count: { select: { castings: true, unavailableDates: true } },
    },
    orderBy: [{ roleType: "asc" }, { name: "asc" }],
  });

  const unlinkedUsers = await prisma.user.findMany({
    where: { actorId: null },
    select: { id: true, email: true, name: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">배우 관리</h1>
        <p className="text-gray-600">배우 추가, 수정, 삭제 및 계정 연결</p>
      </div>
      <ActorManager
        initialActors={actors.map((a) => ({
          id: a.id,
          name: a.name,
          roleType: a.roleType,
          calendarId: a.calendarId,
          linkedUser: a.user
            ? { id: a.user.id, email: a.user.email, name: a.user.name }
            : null,
          castingCount: a._count.castings,
          unavailableCount: a._count.unavailableDates,
        }))}
        unlinkedUsers={unlinkedUsers.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
        }))}
      />
    </div>
  );
}

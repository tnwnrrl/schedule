import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ActorSchedule } from "@/components/actor-schedule";

export default async function ActorDashboard() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const actorId = session.user.actorId;

  if (!actorId) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center">
        <h2 className="text-lg font-semibold">배우 계정 연결 필요</h2>
        <p className="mt-2 text-gray-600">
          관리자에게 문의하여 배우 프로필과 계정을 연결해주세요.
        </p>
      </div>
    );
  }

  const actor = await prisma.actor.findUnique({
    where: { id: actorId },
  });

  const castings = await prisma.casting.findMany({
    where: { actorId },
    include: {
      performanceDate: true,
    },
    orderBy: { performanceDate: { date: "asc" } },
  });

  const unavailableDates = await prisma.unavailableDate.findMany({
    where: { actorId },
    orderBy: { date: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">내 일정</h1>
        <p className="text-gray-600">
          {actor?.name} ({actor?.roleType === "MALE_LEAD" ? "남1" : "여1"})
        </p>
      </div>
      <ActorSchedule
        castings={castings.map((c) => ({
          id: c.id,
          roleType: c.roleType,
          date: c.performanceDate.date.toISOString(),
          startTime: c.performanceDate.startTime,
          endTime: c.performanceDate.endTime,
          label: c.performanceDate.label,
        }))}
        unavailableDates={unavailableDates.map((u) =>
          u.date.toISOString().split("T")[0]
        )}
      />
    </div>
  );
}

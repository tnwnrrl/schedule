import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { UnavailablePicker } from "@/components/unavailable-picker";

export default async function UnavailablePage() {
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

  const actor = await prisma.actor.findUnique({ where: { id: actorId } });

  const unavailableDates = await prisma.unavailableDate.findMany({
    where: { actorId },
    orderBy: { date: "asc" },
  });

  const performanceDates = await prisma.performanceDate.findMany({
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">불가일정 등록</h1>
        <p className="text-gray-600">
          {actor?.name} - 출연이 불가능한 공연 날짜를 선택하세요
        </p>
      </div>
      <UnavailablePicker
        actorId={actorId}
        initialDates={unavailableDates.map((u) =>
          u.date.toISOString().split("T")[0]
        )}
        performanceDates={performanceDates.map((p) => ({
          date: p.date.toISOString().split("T")[0],
          startTime: p.startTime,
          label: p.label,
        }))}
      />
    </div>
  );
}

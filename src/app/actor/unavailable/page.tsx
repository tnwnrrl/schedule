import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { UnavailableCalendar } from "@/components/unavailable-calendar";

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">불가일정 등록</h1>
        <p className="text-gray-600">
          {actor?.name} - 달력에서 날짜를 클릭하여 불가일정을 등록하세요
        </p>
      </div>
      <UnavailableCalendar
        actorId={actorId}
        initialDates={unavailableDates.map((u) =>
          u.date.toISOString().split("T")[0]
        )}
      />
    </div>
  );
}

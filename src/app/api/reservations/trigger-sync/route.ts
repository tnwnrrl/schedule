import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureAndGetMonthPerformances } from "@/lib/schedule";

// POST /api/reservations/trigger-sync
export async function POST() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const crawlerUrl = process.env.CRAWLER_URL;
  if (!crawlerUrl) {
    return NextResponse.json(
      { error: "CRAWLER_URL not configured" },
      { status: 500 }
    );
  }

  // 1. 크롤러에서 이번 달+다음 달 예약 조회
  let crawlerData: {
    months: Array<{ year: number; month: number }>;
    reservations: Record<string, string[]>;
  };

  try {
    const res = await fetch(`${crawlerUrl}/bookings/month`, {
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `크롤러 응답 오류: ${res.status}` },
        { status: 502 }
      );
    }
    crawlerData = await res.json();
  } catch (e) {
    return NextResponse.json(
      { error: `크롤러 연결 실패: ${(e as Error).message}` },
      { status: 502 }
    );
  }

  // 2. PerformanceDate 보장 + 조회
  const allPerfDates = (
    await Promise.all(
      crawlerData.months.map((m) =>
        ensureAndGetMonthPerformances(m.year, m.month)
      )
    )
  ).flat();

  // 3. 예약 유무 Set 구성
  const reservedSet = new Set<string>();
  for (const [dateStr, times] of Object.entries(crawlerData.reservations)) {
    for (const time of times) {
      reservedSet.add(`${dateStr}_${time}`);
    }
  }

  // 4. ReservationStatus upsert
  let reservedCount = 0;
  const upserts = allPerfDates.map((p) => {
    const dateStr = p.date.toISOString().split("T")[0];
    const hasReservation = reservedSet.has(`${dateStr}_${p.startTime}`);
    if (hasReservation) reservedCount++;

    return prisma.reservationStatus.upsert({
      where: { performanceDateId: p.id },
      update: { hasReservation },
      create: { performanceDateId: p.id, hasReservation },
    });
  });

  await prisma.$transaction(upserts);

  return NextResponse.json({
    success: true,
    total: allPerfDates.length,
    reserved: reservedCount,
  });
}

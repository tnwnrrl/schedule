import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureAndGetMonthPerformances } from "@/lib/schedule";

// POST /api/reservations/sync
export async function POST(req: NextRequest) {
  // API 키 인증
  const apiKey = process.env.RESERVATION_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "RESERVATION_API_KEY not configured" },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get("authorization");
  const providedKey =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (providedKey !== apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { year, month, reservations } = body as {
    year: number;
    month: number;
    reservations: Record<string, string[]>; // { "2026-02-25": ["15:15", "17:30"] }
  };

  if (!year || !month || !reservations) {
    return NextResponse.json(
      { error: "year, month, reservations는 필수입니다" },
      { status: 400 }
    );
  }

  // 해당 월 PerformanceDate 보장 + 조회
  const perfDates = await ensureAndGetMonthPerformances(year, month);

  // 요청 데이터에서 예약 유무 Set 구성 ("2026-02-25_15:15" 형태)
  const reservedSet = new Set<string>();
  for (const [dateStr, times] of Object.entries(reservations)) {
    for (const time of times) {
      reservedSet.add(`${dateStr}_${time}`);
    }
  }

  // 월 전체 PerformanceDate에 대해 ReservationStatus upsert (단일 트랜잭션)
  let reservedCount = 0;
  const upserts = perfDates.map((p) => {
    const dateStr = p.date.toISOString().split("T")[0];
    const hasReservation = reservedSet.has(`${dateStr}_${p.startTime}`);
    if (hasReservation) reservedCount++;

    return prisma.reservationStatus.upsert({
      where: { performanceDateId: p.id },
      update: { hasReservation },
      create: {
        performanceDateId: p.id,
        hasReservation,
      },
    });
  });

  await prisma.$transaction(upserts);

  return NextResponse.json({
    success: true,
    total: perfDates.length,
    reserved: reservedCount,
  });
}

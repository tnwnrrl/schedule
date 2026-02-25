import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureAndGetMonthPerformances, resolveBookingContact } from "@/lib/schedule";
import type { BookingDetail } from "@/lib/schedule";

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
  const { months, reservations, booking_details } = body as {
    months: Array<{ year: number; month: number }>;
    reservations: Record<string, string[]>; // { "2026-02-25": ["15:15", "17:30"] }
    booking_details?: Record<string, BookingDetail[]>;
  };

  // 하위 호환: 기존 year/month 단일 형식도 지원
  const monthList =
    months ??
    (body.year && body.month ? [{ year: body.year, month: body.month }] : null);

  if (!monthList || monthList.length === 0 || !reservations) {
    return NextResponse.json(
      { error: "months(또는 year+month)와 reservations는 필수입니다" },
      { status: 400 }
    );
  }

  // 여러 달 PerformanceDate 보장 + 조회
  const allPerfDates = (
    await Promise.all(
      monthList.map((m) => ensureAndGetMonthPerformances(m.year, m.month))
    )
  ).flat();

  // 요청 데이터에서 예약 유무 Set 구성 ("2026-02-25_15:15" 형태)
  const reservedSet = new Set<string>();
  for (const [dateStr, times] of Object.entries(reservations)) {
    for (const time of times) {
      reservedSet.add(`${dateStr}_${time}`);
    }
  }

  // booking_details → slotKey Map 변환
  const detailMap = new Map<string, BookingDetail>();
  if (booking_details) {
    for (const [dateStr, details] of Object.entries(booking_details)) {
      for (const detail of details) {
        detailMap.set(`${dateStr}_${detail.booking_time}`, detail);
      }
    }
  }

  // 전체 PerformanceDate에 대해 ReservationStatus upsert (예약 상세정보 포함)
  let reservedCount = 0;
  const upserts = allPerfDates.map((p) => {
    const dateStr = p.date.toISOString().split("T")[0];
    const slotKey = `${dateStr}_${p.startTime}`;
    const hasReservation = reservedSet.has(slotKey);
    if (hasReservation) reservedCount++;

    const detail = detailMap.get(slotKey);

    if (hasReservation && detail) {
      const { name, contact } = resolveBookingContact(detail);
      return prisma.reservationStatus.upsert({
        where: { performanceDateId: p.id },
        update: { hasReservation, reservationName: name, reservationContact: contact },
        create: { performanceDateId: p.id, hasReservation, reservationName: name, reservationContact: contact },
      });
    }

    if (!hasReservation) {
      return prisma.reservationStatus.upsert({
        where: { performanceDateId: p.id },
        update: { hasReservation, reservationName: null, reservationContact: null },
        create: { performanceDateId: p.id, hasReservation },
      });
    }

    // hasReservation=true but no detail → keep existing name/contact
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

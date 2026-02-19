import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateEventDescription } from "@/lib/google-calendar";

interface Booking {
  customer_name: string;
  phone_number: string;
  booking_time: string; // "오후 3:15", "오전 10:45" 등
}

// 한국어 시간 → 24시간제 변환 ("오후 3:15" → "15:15", "오전 10:45" → "10:45")
function parseKoreanTime(timeStr: string): string | null {
  const match = timeStr.match(/^(오전|오후)\s*(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const [, period, hourStr, min] = match;
  let hour = parseInt(hourStr);

  if (period === "오후" && hour < 12) hour += 12;
  if (period === "오전" && hour === 12) hour = 0;

  return `${String(hour).padStart(2, "0")}:${min}`;
}

// 예약 정보로 description 생성
function buildDescription(name: string, contact: string): string {
  return `예약자: ${name}\n연락처: ${contact}`;
}

// POST /api/casting/reservations
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
  const { date, bookings } = body as { date: string; bookings: Booking[] };

  if (!date || !bookings || !Array.isArray(bookings)) {
    return NextResponse.json(
      { error: "date(string)와 bookings(array)는 필수입니다" },
      { status: 400 }
    );
  }

  // 해당 날짜의 PerformanceDate 조회
  const targetDate = new Date(date + "T00:00:00Z");
  const nextDate = new Date(targetDate);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);

  const perfDates = await prisma.performanceDate.findMany({
    where: {
      date: { gte: targetDate, lt: nextDate },
    },
  });

  if (perfDates.length === 0) {
    return NextResponse.json(
      { error: `${date}에 등록된 공연 회차가 없습니다` },
      { status: 404 }
    );
  }

  // startTime 기준 Map
  const perfDateMap = new Map(perfDates.map((p) => [p.startTime, p]));

  const results: Array<{
    booking_time: string;
    success: boolean;
    error?: string;
  }> = [];

  for (const booking of bookings) {
    const time24 = parseKoreanTime(booking.booking_time);
    if (!time24) {
      results.push({
        booking_time: booking.booking_time,
        success: false,
        error: `시간 파싱 실패: ${booking.booking_time}`,
      });
      continue;
    }

    const perfDate = perfDateMap.get(time24);
    if (!perfDate) {
      results.push({
        booking_time: booking.booking_time,
        success: false,
        error: `${time24} 회차가 없습니다`,
      });
      continue;
    }

    // 해당 회차의 MALE_LEAD 캐스팅 조회
    const casting = await prisma.casting.findUnique({
      where: {
        performanceDateId_roleType: {
          performanceDateId: perfDate.id,
          roleType: "MALE_LEAD",
        },
      },
      include: {
        actor: { select: { calendarId: true } },
      },
    });

    if (!casting) {
      results.push({
        booking_time: booking.booking_time,
        success: false,
        error: "남배우 캐스팅이 없습니다",
      });
      continue;
    }

    // 메모 업데이트
    const description = buildDescription(
      booking.customer_name,
      booking.phone_number
    );

    await prisma.casting.update({
      where: { id: casting.id },
      data: {
        reservationName: booking.customer_name,
        reservationContact: booking.phone_number,
      },
    });

    // Google Calendar 이벤트 description 업데이트
    if (casting.calendarEventId) {
      const calendarId =
        casting.actor.calendarId || process.env.CALENDAR_MALE_LEAD;
      if (calendarId) {
        await updateEventDescription(
          calendarId,
          casting.calendarEventId,
          description
        ).catch((e) =>
          console.error("캘린더 description 업데이트 실패:", e)
        );
      }
    }

    results.push({ booking_time: booking.booking_time, success: true });
  }

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  return NextResponse.json({
    success: true,
    date,
    successCount,
    failCount,
    results: failCount > 0 ? results : undefined,
  });
}

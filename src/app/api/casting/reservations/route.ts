import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateEventDescription } from "@/lib/google-calendar";
import { buildReservationDescription } from "@/lib/schedule";

interface Booking {
  customer_name: string;
  phone_number: string;
  booking_time: string; // "오후 3:15", "오전 10:45" 등
  has_visitor?: boolean;
  visitor_name?: string;
  visitor_phone?: string;
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

    // 방문자 우선 로직 (크롤러의 send_all_notifications과 동일 패턴)
    const name = booking.has_visitor && booking.visitor_name
      ? booking.visitor_name
      : booking.customer_name;
    const phone = booking.has_visitor && booking.visitor_phone
      ? booking.visitor_phone
      : booking.phone_number;

    // ReservationStatus에 메모 저장 (캐스팅 독립)
    await prisma.reservationStatus.upsert({
      where: { performanceDateId: perfDate.id },
      update: { reservationName: name, reservationContact: phone, hasReservation: true },
      create: { performanceDateId: perfDate.id, hasReservation: true, reservationName: name, reservationContact: phone },
    });

    // MALE_LEAD 캐스팅이 있으면 캘린더 description 업데이트 (선택적)
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

    if (casting?.calendarEventId) {
      const description = buildReservationDescription(name, phone);
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

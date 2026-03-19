import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  // Bearer token authentication
  const authHeader = req.headers.get("authorization");
  const providedKey = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  const apiKey = process.env.VERIFY_CONTACT_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "VERIFY_CONTACT_KEY not configured" },
      { status: 500 }
    );
  }

  if (providedKey !== apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse request body
  let body: { contact?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { contact } = body;
  if (!contact || typeof contact !== "string") {
    return NextResponse.json(
      { error: "contact(string)는 필수입니다" },
      { status: 400 }
    );
  }

  // Normalize: digits only
  const normalized = contact.replace(/\D/g, "");
  if (normalized.length < 10 || normalized.length > 11) {
    return NextResponse.json(
      { error: "유효하지 않은 연락처 형식입니다" },
      { status: 400 }
    );
  }

  try {
    // KST today: UTC+9
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstNow = new Date(now.getTime() + kstOffset);
    const kstDateStr = kstNow.toISOString().slice(0, 10); // "YYYY-MM-DD"

    const dayStart = new Date(kstDateStr + "T00:00:00Z");
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    // Find today's performance dates with reservations
    const perfDates = await prisma.performanceDate.findMany({
      where: {
        date: { gte: dayStart, lt: dayEnd },
      },
      include: {
        reservationStatus: true,
      },
    });

    if (perfDates.length === 0) {
      return NextResponse.json({
        valid: false,
        message: "오늘 예약된 공연이 없습니다",
      });
    }

    // Check if any reservation contact matches
    for (const perf of perfDates) {
      const rs = perf.reservationStatus;
      if (!rs || !rs.hasReservation || !rs.reservationContact) continue;

      const dbContact = rs.reservationContact.replace(/\D/g, "");
      if (dbContact === normalized) {
        return NextResponse.json({
          valid: true,
          message: "인증되었습니다",
        });
      }
    }

    return NextResponse.json({
      valid: false,
      message: "예약 정보를 찾을 수 없습니다",
    });
  } catch (error) {
    console.error("verify-contact error:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}

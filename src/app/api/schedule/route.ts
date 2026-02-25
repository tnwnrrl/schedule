import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureAndGetMonthPerformances } from "@/lib/schedule";

// GET /api/schedule?year=2026&month=2
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Invalid year or month" }, { status: 400 });
  }

  // perfDates 보장 + 조회를 한 번에 (중복 SELECT 제거)
  const [perfDates, actors] = await Promise.all([
    ensureAndGetMonthPerformances(year, month),
    prisma.actor.findMany({
      orderBy: [{ roleType: "asc" }, { name: "asc" }],
      select: { id: true, name: true, roleType: true },
    }),
  ]);

  // performances를 날짜별로 그룹핑
  const performances: Record<string, Array<{ id: string; startTime: string; label: string | null }>> = {};
  for (const p of perfDates) {
    const dateStr = p.date.toISOString().split("T")[0];
    if (!performances[dateStr]) performances[dateStr] = [];
    performances[dateStr].push({
      id: p.id,
      startTime: p.startTime,
      label: p.label,
    });
  }

  // Casting + UnavailableDate + Override 병렬 조회
  const perfDateIds = perfDates.map((p) => p.id);
  const isAdmin = session.user.role === "ADMIN";

  const [castingRows, unavailableRows, reservationRows, ...overrideResult] = await Promise.all([
    prisma.casting.findMany({
      where: { performanceDateId: { in: perfDateIds } },
      include: {
        actor: { select: { id: true, name: true, roleType: true } },
      },
    }),
    prisma.unavailableDate.findMany({
      where: { performanceDateId: { in: perfDateIds } },
    }),
    prisma.reservationStatus.findMany({
      where: { performanceDateId: { in: perfDateIds } },
      select: { performanceDateId: true, hasReservation: true, reservationName: true, reservationContact: true, checkedAt: true },
    }),
    ...(isAdmin
      ? [prisma.actorMonthOverride.findMany({
          where: { year, month },
          select: { actorId: true },
        })]
      : []),
  ]);

  const castings: Record<string, { castingId: string; actorId: string; actorName: string; synced: boolean }> = {};
  for (const c of castingRows) {
    castings[`${c.performanceDateId}_${c.roleType}`] = {
      castingId: c.id,
      actorId: c.actor.id,
      actorName: c.actor.name,
      synced: c.synced,
    };
  }

  // UnavailableDate 매핑 (performanceDateId 기준)
  const unavailable: Record<string, string[]> = {};
  for (const u of unavailableRows) {
    if (!unavailable[u.actorId]) unavailable[u.actorId] = [];
    unavailable[u.actorId].push(u.performanceDateId);
  }

  // ReservationStatus 매핑
  const reservations: Record<string, boolean> = {};
  const reservationMemos: Record<string, { name: string; contact: string }> = {};
  let reservationCheckedAt: string | null = null;
  for (const r of reservationRows) {
    reservations[r.performanceDateId] = r.hasReservation;
    if (r.reservationName || r.reservationContact) {
      reservationMemos[r.performanceDateId] = {
        name: r.reservationName || "",
        contact: r.reservationContact || "",
      };
    }
    if (!reservationCheckedAt || r.checkedAt > new Date(reservationCheckedAt)) {
      reservationCheckedAt = r.checkedAt.toISOString();
    }
  }

  // ADMIN일 때 overriddenActors 포함
  const overriddenActors = isAdmin && overrideResult[0]
    ? (overrideResult[0] as Array<{ actorId: string }>).map((o) => o.actorId)
    : undefined;

  return NextResponse.json(
    { performances, castings, unavailable, actors, reservations, reservationMemos, reservationCheckedAt, ...(overriddenActors !== undefined && { overriddenActors }) },
    {
      headers: {
        "Cache-Control": "private, s-maxage=30, stale-while-revalidate=60",
      },
    }
  );
}

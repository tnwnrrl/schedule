import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SHOW_TIMES } from "@/lib/constants";

// 해당 월 PerformanceDate 보장 + 반환 (중복 조회 제거)
async function ensureAndGetMonthPerformances(year: number, month: number) {
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 1));

  const existing = await prisma.performanceDate.findMany({
    where: { date: { gte: startDate, lt: endDate } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  const daysInMonth = new Date(year, month, 0).getDate();
  const expectedCount = daysInMonth * SHOW_TIMES.length;

  // 이미 모두 존재하면 바로 반환 (가장 흔한 케이스 → DB 왕복 1회로 끝)
  if (existing.length >= expectedCount) {
    return existing;
  }

  // 부족한 레코드만 생성
  const existingSet = new Set(
    existing.map((e) => `${e.date.toISOString().split("T")[0]}_${e.startTime}`)
  );

  const toCreate: Array<{ date: Date; startTime: string }> = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const utcDate = new Date(Date.UTC(year, month - 1, day));
    const dateStr = utcDate.toISOString().split("T")[0];
    for (const time of SHOW_TIMES) {
      if (!existingSet.has(`${dateStr}_${time}`)) {
        toCreate.push({ date: utcDate, startTime: time });
      }
    }
  }

  if (toCreate.length > 0) {
    await prisma.$transaction(
      toCreate.map((d) =>
        prisma.performanceDate.create({ data: d })
      )
    );

    // 생성 후 전체 다시 조회 (정렬 보장)
    return prisma.performanceDate.findMany({
      where: { date: { gte: startDate, lt: endDate } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });
  }

  return existing;
}

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

  const [castingRows, unavailableRows, ...overrideResult] = await Promise.all([
    prisma.casting.findMany({
      where: { performanceDateId: { in: perfDateIds } },
      include: {
        actor: { select: { id: true, name: true, roleType: true } },
      },
    }),
    prisma.unavailableDate.findMany({
      where: { performanceDateId: { in: perfDateIds } },
    }),
    ...(isAdmin
      ? [prisma.actorMonthOverride.findMany({
          where: { year, month },
          select: { actorId: true },
        })]
      : []),
  ]);

  const castings: Record<string, { actorId: string; actorName: string }> = {};
  for (const c of castingRows) {
    castings[`${c.performanceDateId}_${c.roleType}`] = {
      actorId: c.actor.id,
      actorName: c.actor.name,
    };
  }

  // UnavailableDate 매핑 (performanceDateId 기준)
  const unavailable: Record<string, string[]> = {};
  for (const u of unavailableRows) {
    if (!unavailable[u.actorId]) unavailable[u.actorId] = [];
    unavailable[u.actorId].push(u.performanceDateId);
  }

  // ADMIN일 때 overriddenActors 포함
  const overriddenActors = isAdmin && overrideResult[0]
    ? (overrideResult[0] as Array<{ actorId: string }>).map((o) => o.actorId)
    : undefined;

  return NextResponse.json(
    { performances, castings, unavailable, actors, ...(overriddenActors !== undefined && { overriddenActors }) },
    {
      headers: {
        "Cache-Control": "private, s-maxage=30, stale-while-revalidate=60",
      },
    }
  );
}

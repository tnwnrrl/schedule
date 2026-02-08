import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SHOW_TIMES } from "@/lib/constants";

async function ensureMonthPerformances(year: number, month: number) {
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 1));

  // 이미 존재하는 레코드 확인
  const existing = await prisma.performanceDate.findMany({
    where: { date: { gte: startDate, lt: endDate } },
    select: { date: true, startTime: true },
  });

  const existingSet = new Set(
    existing.map((e) => `${e.date.toISOString().split("T")[0]}_${e.startTime}`)
  );

  const daysInMonth = new Date(year, month, 0).getDate();
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
    // 개별 생성 (SQLite는 createMany skipDuplicates 미지원)
    await prisma.$transaction(
      toCreate.map((d) =>
        prisma.performanceDate.create({ data: d })
      )
    );
  }
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

  // 해당 월의 PerformanceDate 보장 (없으면 자동 생성)
  await ensureMonthPerformances(year, month);

  // 해당 월 범위
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 1));

  // 병렬 조회
  const [perfDates, unavailableRows, actors] = await Promise.all([
    prisma.performanceDate.findMany({
      where: { date: { gte: startDate, lt: endDate } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    prisma.unavailableDate.findMany({
      where: { date: { gte: startDate, lt: endDate } },
    }),
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

  // Casting 조회 (perfDateIds 필요)
  const perfDateIds = perfDates.map((p) => p.id);
  const castingRows = await prisma.casting.findMany({
    where: { performanceDateId: { in: perfDateIds } },
    include: {
      actor: { select: { id: true, name: true, roleType: true } },
    },
  });

  const castings: Record<string, { actorId: string; actorName: string }> = {};
  for (const c of castingRows) {
    castings[`${c.performanceDateId}_${c.roleType}`] = {
      actorId: c.actor.id,
      actorName: c.actor.name,
    };
  }

  // UnavailableDate 매핑
  const unavailable: Record<string, string[]> = {};
  for (const u of unavailableRows) {
    if (!unavailable[u.actorId]) unavailable[u.actorId] = [];
    unavailable[u.actorId].push(u.date.toISOString().split("T")[0]);
  }

  return NextResponse.json({
    performances,
    castings,
    unavailable,
    actors,
  });
}

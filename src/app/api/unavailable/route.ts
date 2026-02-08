import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/unavailable?actorId=xxx - 불가일정 조회
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const actorId = searchParams.get("actorId");

  const where = actorId ? { actorId } : {};

  const unavailableDates = await prisma.unavailableDate.findMany({
    where,
    include: {
      actor: { select: { name: true, roleType: true } },
      performanceDate: { select: { date: true, startTime: true } },
    },
    orderBy: { performanceDate: { date: "asc" } },
  });

  return NextResponse.json(unavailableDates);
}

// POST /api/unavailable - 불가일정 동기화 (추가/삭제)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { actorId, performanceDateIds } = body as {
    actorId: string;
    performanceDateIds: string[];
  };

  if (!actorId || !performanceDateIds || !Array.isArray(performanceDateIds)) {
    return NextResponse.json(
      { error: "actorId와 performanceDateIds 배열은 필수입니다" },
      { status: 400 }
    );
  }

  // 배우 본인만 수정 가능 (관리자는 모두 가능)
  if (session.user.role !== "ADMIN" && session.user.actorId !== actorId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 현재 불가일정 조회
  const existing = await prisma.unavailableDate.findMany({
    where: { actorId },
  });
  const existingIds = new Set(existing.map((u) => u.performanceDateId));
  const newIds = new Set(performanceDateIds);

  // 추가할 회차 (newIds에 있고 existing에 없는 것)
  const toAdd = performanceDateIds.filter((id) => !existingIds.has(id));

  // 삭제할 회차 (existing에 있고 newIds에 없는 것)
  const toRemove = existing.filter((u) => !newIds.has(u.performanceDateId));

  // 트랜잭션으로 일괄 처리
  await prisma.$transaction([
    ...toAdd.map((performanceDateId) =>
      prisma.unavailableDate.create({
        data: {
          actorId,
          performanceDateId,
        },
      })
    ),
    ...toRemove.map((u) =>
      prisma.unavailableDate.delete({
        where: { id: u.id },
      })
    ),
  ]);

  // 업데이트된 불가일정 반환
  const updated = await prisma.unavailableDate.findMany({
    where: { actorId },
    orderBy: { performanceDate: { date: "asc" } },
  });

  return NextResponse.json(updated);
}

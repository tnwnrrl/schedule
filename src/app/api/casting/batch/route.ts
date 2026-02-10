import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface CastingChange {
  performanceDateId: string;
  roleType: string;
  actorId: string | null;
}

// POST /api/casting/batch - 배역 배정 일괄 처리 (관리자 전용)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { changes } = body as { changes: CastingChange[] };

  if (!changes || !Array.isArray(changes) || changes.length === 0) {
    return NextResponse.json(
      { error: "changes 배열은 필수입니다" },
      { status: 400 }
    );
  }

  const results: Array<{ key: string; success: boolean; error?: string }> = [];

  // 필요한 데이터를 한번에 조회
  const actorIds = [...new Set(changes.filter((c) => c.actorId).map((c) => c.actorId!))];
  const perfDateIds = [...new Set(changes.map((c) => c.performanceDateId))];

  const [actors, perfDates, unavailables] = await Promise.all([
    actorIds.length > 0
      ? prisma.actor.findMany({ where: { id: { in: actorIds } } })
      : Promise.resolve([]),
    prisma.performanceDate.findMany({ where: { id: { in: perfDateIds } } }),
    actorIds.length > 0
      ? prisma.unavailableDate.findMany({
          where: { actorId: { in: actorIds }, performanceDateId: { in: perfDateIds } },
        })
      : Promise.resolve([]),
  ]);

  const actorMap = new Map(actors.map((a) => [a.id, a]));
  const perfDateSet = new Set(perfDates.map((p) => p.id));
  const unavailableSet = new Set(
    unavailables.map((u) => `${u.actorId}_${u.performanceDateId}`)
  );

  // 트랜잭션으로 일괄 처리
  const operations = [];

  for (const change of changes) {
    const key = `${change.performanceDateId}_${change.roleType}`;

    if (!["MALE_LEAD", "FEMALE_LEAD"].includes(change.roleType)) {
      results.push({ key, success: false, error: "잘못된 roleType" });
      continue;
    }

    if (!perfDateSet.has(change.performanceDateId)) {
      results.push({ key, success: false, error: "공연일 없음" });
      continue;
    }

    // 배정 해제
    if (!change.actorId) {
      operations.push(
        prisma.casting.deleteMany({
          where: {
            performanceDateId: change.performanceDateId,
            roleType: change.roleType,
          },
        })
      );
      results.push({ key, success: true });
      continue;
    }

    // 배우 검증
    const actor = actorMap.get(change.actorId);
    if (!actor) {
      results.push({ key, success: false, error: "배우 없음" });
      continue;
    }
    if (actor.roleType !== change.roleType) {
      results.push({ key, success: false, error: "역할 타입 불일치" });
      continue;
    }

    // 불가일정 확인
    if (unavailableSet.has(`${change.actorId}_${change.performanceDateId}`)) {
      results.push({ key, success: false, error: "불가일정 등록됨" });
      continue;
    }

    operations.push(
      prisma.casting.upsert({
        where: {
          performanceDateId_roleType: {
            performanceDateId: change.performanceDateId,
            roleType: change.roleType,
          },
        },
        update: { actorId: change.actorId, synced: false },
        create: {
          performanceDateId: change.performanceDateId,
          actorId: change.actorId,
          roleType: change.roleType,
          synced: false,
        },
      })
    );
    results.push({ key, success: true });
  }

  if (operations.length > 0) {
    await prisma.$transaction(operations);
  }

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  return NextResponse.json({
    success: true,
    successCount,
    failCount,
    results: failCount > 0 ? results.filter((r) => !r.success) : undefined,
  });
}

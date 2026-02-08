import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/casting - 배역 배정 전체 조회
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const castings = await prisma.casting.findMany({
    include: {
      performanceDate: true,
      actor: { select: { id: true, name: true, roleType: true } },
    },
    orderBy: { performanceDate: { date: "asc" } },
  });

  return NextResponse.json(castings);
}

// POST /api/casting - 배역 배정/변경 (관리자 전용)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { performanceDateId, actorId, roleType } = body;

  if (!performanceDateId || !roleType) {
    return NextResponse.json(
      { error: "performanceDateId와 roleType은 필수입니다" },
      { status: 400 }
    );
  }

  if (!["MALE_LEAD", "FEMALE_LEAD"].includes(roleType)) {
    return NextResponse.json(
      { error: "roleType은 MALE_LEAD 또는 FEMALE_LEAD여야 합니다" },
      { status: 400 }
    );
  }

  // actorId가 null/빈값이면 배정 해제
  if (!actorId) {
    await prisma.casting.deleteMany({
      where: { performanceDateId, roleType },
    });
    return NextResponse.json({ success: true, action: "removed" });
  }

  // 배우의 역할 타입 확인
  const actor = await prisma.actor.findUnique({ where: { id: actorId } });
  if (!actor) {
    return NextResponse.json(
      { error: "배우를 찾을 수 없습니다" },
      { status: 404 }
    );
  }
  if (actor.roleType !== roleType) {
    return NextResponse.json(
      { error: "배우의 역할 타입이 일치하지 않습니다" },
      { status: 400 }
    );
  }

  // 해당 회차에 배우가 불가일정인지 확인
  const perfDate = await prisma.performanceDate.findUnique({
    where: { id: performanceDateId },
  });
  if (!perfDate) {
    return NextResponse.json(
      { error: "공연일을 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  const isUnavailable = await prisma.unavailableDate.findFirst({
    where: {
      actorId,
      performanceDateId,
    },
  });

  if (isUnavailable) {
    return NextResponse.json(
      { error: "해당 배우는 이 회차에 불가일정이 등록되어 있습니다" },
      { status: 400 }
    );
  }

  // upsert: 해당 공연일의 해당 역할에 배정
  const casting = await prisma.casting.upsert({
    where: {
      performanceDateId_roleType: {
        performanceDateId,
        roleType,
      },
    },
    update: { actorId, synced: false },
    create: {
      performanceDateId,
      actorId,
      roleType,
      synced: false,
    },
    include: {
      actor: { select: { name: true } },
      performanceDate: true,
    },
  });

  return NextResponse.json(casting);
}

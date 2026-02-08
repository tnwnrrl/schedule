import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/actors - 배우 목록 조회
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actors = await prisma.actor.findMany({
    include: {
      user: { select: { email: true, name: true } },
      _count: { select: { unavailableDates: true, castings: true } },
    },
    orderBy: [{ roleType: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(actors);
}

// POST /api/actors - 배우 추가 (관리자 전용)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, roleType, calendarId } = body;

  if (!name || !roleType) {
    return NextResponse.json(
      { error: "name과 roleType은 필수입니다" },
      { status: 400 }
    );
  }

  if (!["MALE_LEAD", "FEMALE_LEAD"].includes(roleType)) {
    return NextResponse.json(
      { error: "roleType은 MALE_LEAD 또는 FEMALE_LEAD여야 합니다" },
      { status: 400 }
    );
  }

  const actor = await prisma.actor.create({
    data: { name, roleType, calendarId: calendarId || null },
  });

  return NextResponse.json(actor, { status: 201 });
}

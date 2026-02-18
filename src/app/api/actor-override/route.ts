import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/actor-override — 토글 (있으면 삭제, 없으면 생성)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { actorId, year, month } = await req.json();
  if (!actorId || !year || !month) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const existing = await prisma.actorMonthOverride.findUnique({
    where: { actorId_year_month: { actorId, year, month } },
  });

  if (existing) {
    await prisma.actorMonthOverride.delete({ where: { id: existing.id } });
    return NextResponse.json({ overridden: false });
  }

  await prisma.actorMonthOverride.create({
    data: { actorId, year, month },
  });
  return NextResponse.json({ overridden: true });
}

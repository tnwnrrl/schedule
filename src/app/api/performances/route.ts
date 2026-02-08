import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/performances - 공연일정 전체 조회
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const performances = await prisma.performanceDate.findMany({
    include: {
      castings: {
        include: {
          actor: { select: { id: true, name: true, roleType: true } },
        },
      },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  return NextResponse.json(performances);
}

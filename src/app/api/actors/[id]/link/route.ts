import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/actors/[id]/link - 배우와 사용자 계정 연결
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { userId } = await req.json();

  if (!userId) {
    return NextResponse.json(
      { error: "userId는 필수입니다" },
      { status: 400 }
    );
  }

  // 배우에게 이미 연결된 사용자가 있으면 해제
  await prisma.user.updateMany({
    where: { actorId: id },
    data: { actorId: null },
  });

  // 새 사용자에게 배우 연결
  await prisma.user.update({
    where: { id: userId },
    data: { actorId: id, role: "ACTOR" },
  });

  return NextResponse.json({ success: true });
}

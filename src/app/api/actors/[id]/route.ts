import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PUT /api/actors/[id] - 배우 수정
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { name, roleType, calendarId } = body;

  if (roleType && !["MALE_LEAD", "FEMALE_LEAD"].includes(roleType)) {
    return NextResponse.json(
      { error: "roleType은 MALE_LEAD 또는 FEMALE_LEAD여야 합니다" },
      { status: 400 }
    );
  }

  const actor = await prisma.actor.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(roleType && { roleType }),
      ...(calendarId !== undefined && { calendarId: calendarId || null }),
    },
  });

  // 연결된 계정 이메일 수정
  if (body.userEmail !== undefined) {
    const linkedUser = await prisma.user.findFirst({ where: { actorId: id } });
    if (linkedUser) {
      // 다른 사용자가 이미 사용 중인 이메일인지 확인
      if (body.userEmail) {
        const existing = await prisma.user.findFirst({
          where: { email: body.userEmail, id: { not: linkedUser.id } },
        });
        if (existing) {
          return NextResponse.json(
            { error: "이미 사용 중인 이메일입니다" },
            { status: 400 }
          );
        }
      }
      await prisma.user.update({
        where: { id: linkedUser.id },
        data: { email: body.userEmail || null },
      });
    }
  }

  return NextResponse.json(actor);
}

// DELETE /api/actors/[id] - 배우 삭제
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  await prisma.actor.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

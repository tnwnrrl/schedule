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

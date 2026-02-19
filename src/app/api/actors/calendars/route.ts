import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createActorCalendar,
  shareCalendarWithEmail,
} from "@/lib/google-calendar";

// POST /api/actors/calendars - 배우별 개인 캘린더 일괄 생성/공유
export async function POST() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const actors = await prisma.actor.findMany({
    include: { user: { select: { email: true } } },
  });

  let created = 0;
  let shared = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const actor of actors) {
    // 이미 캘린더가 있으면 건너뛰기 (공유만 재시도)
    if (actor.calendarId) {
      // 이메일이 있으면 공유 재시도
      const email = actor.user?.email;
      if (email) {
        const ok = await shareCalendarWithEmail(actor.calendarId, email);
        if (ok) shared++;
      }
      skipped++;
      continue;
    }

    // 캘린더 생성
    const calendarId = await createActorCalendar(actor.name);
    if (!calendarId) {
      errors.push(`${actor.name}: 캘린더 생성 실패`);
      continue;
    }

    // DB 저장
    await prisma.actor.update({
      where: { id: actor.id },
      data: { calendarId },
    });
    created++;

    // 이메일이 있으면 공유
    const email = actor.user?.email;
    if (email) {
      const ok = await shareCalendarWithEmail(calendarId, email);
      if (ok) {
        shared++;
      } else {
        errors.push(`${actor.name}: 공유 실패 (${email})`);
      }
    }
  }

  const parts: string[] = [];
  if (created > 0) parts.push(`${created}개 캘린더 생성`);
  if (shared > 0) parts.push(`${shared}개 공유 완료`);
  if (skipped > 0) parts.push(`${skipped}개 이미 존재`);
  if (errors.length > 0) parts.push(`${errors.length}개 오류`);

  return NextResponse.json({
    message: parts.join(", ") || "처리 대상 없음",
    created,
    shared,
    skipped,
    ...(errors.length > 0 && { errors }),
  });
}

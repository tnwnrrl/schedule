import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token || token.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year");
  const month = searchParams.get("month");

  if (!year || !month) {
    return NextResponse.json({ error: "year, month required" }, { status: 400 });
  }

  const monthStr = String(month).padStart(2, "0");
  const prefix = `${year}-${monthStr}-`;

  const entries = await prisma.actorOvertimeEntry.findMany({
    where: { date: { startsWith: prefix } },
    orderBy: [{ actorId: "asc" }, { date: "asc" }],
  });

  return NextResponse.json(entries);
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req });
  if (!token || token.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { actorId, date, type, hours } = body;

  if (!actorId || !date || !type || hours == null) {
    return NextResponse.json({ error: "actorId, date, type, hours required" }, { status: 400 });
  }
  if (!["EDUCATION", "EXTRA_SHOW"].includes(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
  if (typeof hours !== "number" || hours <= 0) {
    return NextResponse.json({ error: "hours must be positive number" }, { status: 400 });
  }

  const entry = await prisma.actorOvertimeEntry.upsert({
    where: { actorId_date_type: { actorId, date, type } },
    update: { hours },
    create: { actorId, date, type, hours },
  });

  return NextResponse.json(entry);
}

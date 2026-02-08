import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 샘플 배우 데이터
  const maleActors = [
    { name: "남배우1", roleType: "MALE_LEAD" },
    { name: "남배우2", roleType: "MALE_LEAD" },
    { name: "남배우3", roleType: "MALE_LEAD" },
  ];

  const femaleActors = [
    { name: "여배우1", roleType: "FEMALE_LEAD" },
    { name: "여배우2", roleType: "FEMALE_LEAD" },
    { name: "여배우3", roleType: "FEMALE_LEAD" },
  ];

  for (const actor of [...maleActors, ...femaleActors]) {
    await prisma.actor.upsert({
      where: { id: actor.name },
      update: {},
      create: {
        id: actor.name,
        name: actor.name,
        roleType: actor.roleType,
      },
    });
  }

  // 샘플 공연 일정 (2026년 3월)
  const performances = [
    { date: new Date("2026-03-06"), startTime: "19:30", label: "프리뷰" },
    { date: new Date("2026-03-07"), startTime: "14:00", label: "1회" },
    { date: new Date("2026-03-07"), startTime: "19:30", label: "2회" },
    { date: new Date("2026-03-08"), startTime: "14:00", label: "3회" },
    { date: new Date("2026-03-08"), startTime: "18:00", label: "4회" },
    { date: new Date("2026-03-13"), startTime: "19:30", label: "5회" },
    { date: new Date("2026-03-14"), startTime: "14:00", label: "6회" },
    { date: new Date("2026-03-14"), startTime: "19:30", label: "7회" },
    { date: new Date("2026-03-15"), startTime: "14:00", label: "8회" },
    { date: new Date("2026-03-15"), startTime: "18:00", label: "9회" },
  ];

  for (const perf of performances) {
    await prisma.performanceDate.upsert({
      where: {
        date_startTime: {
          date: perf.date,
          startTime: perf.startTime,
        },
      },
      update: {},
      create: {
        date: perf.date,
        startTime: perf.startTime,
        label: perf.label,
      },
    });
  }

  console.log("Seed completed: 6 actors, 10 performances");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

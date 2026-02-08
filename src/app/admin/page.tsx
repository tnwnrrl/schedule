import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, CalendarDays, Ban, Theater } from "lucide-react";
import Link from "next/link";
import { DashboardCalendar } from "@/components/dashboard-calendar";

export default async function AdminDashboard() {
  const [actorCount, performanceCount, castingCount, unavailableCount] =
    await Promise.all([
      prisma.actor.count(),
      prisma.performanceDate.count(),
      prisma.casting.count(),
      prisma.unavailableDate.count(),
    ]);

  const totalSlots = performanceCount * 2; // 남1 + 여1
  const fillRate = totalSlots > 0 ? Math.round((castingCount / totalSlots) * 100) : 0;

  const stats = [
    {
      label: "배우",
      value: actorCount,
      icon: Users,
      href: "/admin/actors",
    },
    {
      label: "공연 회차",
      value: performanceCount,
      icon: CalendarDays,
      href: "/admin/casting",
    },
    {
      label: "배역 배정",
      value: `${castingCount}/${totalSlots} (${fillRate}%)`,
      icon: Theater,
      href: "/admin/casting",
    },
    {
      label: "불가일정",
      value: unavailableCount,
      icon: Ban,
      href: "/admin/casting",
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">관리자 대시보드</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="transition-colors hover:bg-gray-50">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  {stat.label}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-gray-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>배정 현황</CardTitle>
        </CardHeader>
        <CardContent>
          <DashboardCalendar />
        </CardContent>
      </Card>
    </div>
  );
}

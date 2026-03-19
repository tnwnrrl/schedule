import { DashboardCalendar } from "@/components/dashboard-calendar";

export default function AdminDashboard() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">관리자 대시보드</h1>
      <DashboardCalendar />
    </div>
  );
}

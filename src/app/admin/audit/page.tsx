import { CalendarAudit } from "@/components/calendar-audit";

export default function AuditPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Google Calendar 감사</h1>
      <CalendarAudit />
    </div>
  );
}

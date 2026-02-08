import { CastingCalendar } from "@/components/casting-calendar";

export default function CastingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">배역 배정</h1>
        <p className="text-gray-600">
          날짜를 클릭하여 배역을 배정하세요. 불가일정이 있는 배우는 드롭다운에
          표시되지 않습니다.
        </p>
      </div>
      <CastingCalendar />
    </div>
  );
}

import { calendar as googleCalendar } from "@googleapis/calendar";
import { JWT } from "google-auth-library";

// 모듈 레벨 캐싱 (매 호출마다 재생성 방지)
let cachedAuth: JWT | null = null;

function getAuth() {
  if (cachedAuth) return cachedAuth;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim().replace(
    /\\n/g,
    "\n"
  );

  if (!email || !key) {
    throw new Error("Google Service Account 환경변수가 설정되지 않았습니다");
  }

  cachedAuth = new JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  return cachedAuth;
}

function getCalendar() {
  return googleCalendar({ version: "v3", auth: getAuth() });
}

// 불가일정 → 배우 개인 캘린더에 이벤트 생성
export async function createUnavailableEvent(
  calendarId: string,
  actorName: string,
  date: string
): Promise<string | null> {
  try {
    const calendar = getCalendar();
    const res = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: `[불가] ${actorName}`,
        start: { date },
        end: { date },
        colorId: "11", // 빨간색
      },
    });
    return res.data.id || null;
  } catch (error) {
    console.error("캘린더 이벤트 생성 실패:", error);
    return null;
  }
}

// 캘린더 이벤트 삭제 (sendNotifications으로 참석자에게 취소 알림)
export async function deleteCalendarEvent(
  calendarId: string,
  eventId: string,
  sendNotifications: boolean = false
): Promise<boolean> {
  try {
    const calendar = getCalendar();
    await calendar.events.delete({
      calendarId,
      eventId,
      sendUpdates: sendNotifications ? "all" : "none",
    });
    return true;
  } catch (error) {
    console.error("캘린더 이벤트 삭제 실패:", error);
    return false;
  }
}

// 배역 배정 → 캘린더에 이벤트 생성 (배우 개인 캘린더 우선, 없으면 역할 캘린더)
export async function createCastingEvent(
  roleType: string,
  actorName: string,
  date: string,
  startTime: string,
  endTime?: string | null,
  label?: string | null,
  actorCalendarId?: string | null,
  description?: string | null
): Promise<string | null> {
  // 배우 개인 캘린더 → 역할별 캘린더 → 없으면 실패
  const calendarId =
    actorCalendarId ||
    (roleType === "MALE_LEAD"
      ? process.env.CALENDAR_MALE_LEAD
      : process.env.CALENDAR_FEMALE_LEAD);

  if (!calendarId) {
    console.error(`캘린더 ID가 설정되지 않았습니다: ${roleType}`);
    return null;
  }

  const calendar = getCalendar();
  const summary = `${actorName}${label ? ` (${label})` : ""}`;

  // 시작/종료 시간 파싱
  const startDateTime = `${date}T${startTime}:00`;
  const endDateTime = endTime
    ? `${date}T${endTime}:00`
    : `${date}T${addHours(startTime, 2)}:00`;

  const requestBody: Record<string, unknown> = {
    summary,
    start: { dateTime: startDateTime, timeZone: "Asia/Seoul" },
    end: { dateTime: endDateTime, timeZone: "Asia/Seoul" },
    colorId: roleType === "MALE_LEAD" ? "9" : "6", // 파랑/보라
  };
  if (description) {
    requestBody.description = description;
  }

  const res = await calendar.events.insert({
    calendarId,
    requestBody,
  });
  return res.data.id || null;
}

// 배역 배정 이벤트 업데이트
export async function updateCastingEvent(
  roleType: string,
  eventId: string,
  actorName: string,
  label?: string | null
): Promise<boolean> {
  const calendarId =
    roleType === "MALE_LEAD"
      ? process.env.CALENDAR_MALE_LEAD
      : process.env.CALENDAR_FEMALE_LEAD;

  if (!calendarId) return false;

  try {
    const calendar = getCalendar();
    await calendar.events.patch({
      calendarId,
      eventId,
      requestBody: {
        summary: `${actorName}${label ? ` (${label})` : ""}`,
      },
    });
    return true;
  } catch (error) {
    console.error("배역 캘린더 이벤트 업데이트 실패:", error);
    return false;
  }
}

// 캘린더 이벤트 description 업데이트
export async function updateEventDescription(
  calendarId: string,
  eventId: string,
  description: string | null
): Promise<boolean> {
  try {
    const calendar = getCalendar();
    await calendar.events.patch({
      calendarId,
      eventId,
      requestBody: {
        description: description || "",
      },
    });
    return true;
  } catch (error) {
    console.error("캘린더 이벤트 description 업데이트 실패:", error);
    return false;
  }
}

// 배우 개인 캘린더 생성
export async function createActorCalendar(
  actorName: string
): Promise<string | null> {
  const calendar = getCalendar();
  const res = await calendar.calendars.insert({
    requestBody: {
      summary: `공연 스케줄 - ${actorName}`,
      timeZone: "Asia/Seoul",
    },
  });
  return res.data.id || null;
}

// 캘린더를 특정 이메일과 공유
export async function shareCalendarWithEmail(
  calendarId: string,
  email: string,
  role: "reader" | "writer" = "reader"
): Promise<boolean> {
  try {
    const calendar = getCalendar();
    await calendar.acl.insert({
      calendarId,
      requestBody: {
        role,
        scope: { type: "user", value: email },
      },
    });
    return true;
  } catch (error) {
    console.error("캘린더 공유 실패:", error);
    return false;
  }
}

function addHours(time: string, hours: number): string {
  const [h, m] = time.split(":").map(Number);
  const newH = (h + hours) % 24;
  return `${String(newH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// === 전체배우일정 캘린더 미러링 ===

// 캐스팅 이벤트를 전체배우일정 캘린더에도 생성
export async function mirrorCastingToAllCalendar(
  roleType: string,
  actorName: string,
  date: string,
  startTime: string,
  endTime?: string | null,
  label?: string | null,
  description?: string | null
): Promise<string | null> {
  const calendarId = process.env.CALENDAR_ALL_ACTORS;
  if (!calendarId) return null;

  try {
    const calendar = getCalendar();
    const summary = `${actorName}${label ? ` (${label})` : ""}`;
    const startDateTime = `${date}T${startTime}:00`;
    const endDateTime = endTime
      ? `${date}T${endTime}:00`
      : `${date}T${addHours(startTime, 2)}:00`;

    const requestBody: Record<string, unknown> = {
      summary,
      start: { dateTime: startDateTime, timeZone: "Asia/Seoul" },
      end: { dateTime: endDateTime, timeZone: "Asia/Seoul" },
      colorId: roleType === "MALE_LEAD" ? "9" : "6",
    };
    if (description) {
      requestBody.description = description;
    }

    const res = await calendar.events.insert({ calendarId, requestBody });
    return res.data.id || null;
  } catch (error) {
    console.error("전체배우일정 캐스팅 이벤트 생성 실패:", error);
    return null;
  }
}

// 불가일정 이벤트를 전체배우일정 캘린더에도 생성
export async function mirrorUnavailableToAllCalendar(
  actorName: string,
  date: string
): Promise<string | null> {
  const calendarId = process.env.CALENDAR_ALL_ACTORS;
  if (!calendarId) return null;

  try {
    return await createUnavailableEvent(calendarId, actorName, date);
  } catch (error) {
    console.error("전체배우일정 불가일정 이벤트 생성 실패:", error);
    return null;
  }
}

// 전체배우일정 캘린더에서 이벤트 삭제
export async function deleteFromAllCalendar(
  eventId: string
): Promise<boolean> {
  const calendarId = process.env.CALENDAR_ALL_ACTORS;
  if (!calendarId) return false;

  try {
    return await deleteCalendarEvent(calendarId, eventId);
  } catch (error) {
    console.error("전체배우일정 이벤트 삭제 실패:", error);
    return false;
  }
}

// 전체배우일정 캘린더 이벤트 description 업데이트
export async function updateAllCalendarDescription(
  eventId: string,
  description: string | null
): Promise<boolean> {
  const calendarId = process.env.CALENDAR_ALL_ACTORS;
  if (!calendarId) return false;

  try {
    return await updateEventDescription(calendarId, eventId, description);
  } catch (error) {
    console.error("전체배우일정 description 업데이트 실패:", error);
    return false;
  }
}

// 전체 동기화 (수동 트리거)
export async function syncAllToCalendar() {
  // 이 함수는 API 엔드포인트에서 호출됨
  // 구현은 calendar/sync route에서 처리
  return { success: true };
}

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

공연 스케줄 관리 & 배역 배정 웹앱. 배우들이 회차별 불가일정을 등록하고, 관리자(연출)가 배역을 수동 배정하는 시스템. Google Calendar 양방향 연동 + 네이버 예약 크롤러 연동.

**프로덕션 URL**: https://schedule.mysterydam.com

## 기술 스택

- **프레임워크**: Next.js 16 (App Router) + React 19
- **언어**: TypeScript (경로 별칭 `@/*` → `./src/*`)
- **DB**: SQLite (로컬) + Turso/LibSQL (프로덕션, `@prisma/adapter-libsql`)
- **ORM**: Prisma 6
- **인증**: 관리자 비밀번호 로그인 (`/api/login` → JWT) + 배우 Google OAuth (Auth.js v5)
- **캘린더**: `@googleapis/calendar` + `google-auth-library` (Service Account)
- **UI**: Tailwind CSS v4 + shadcn/ui (Radix UI, new-york 스타일)

## 개발 명령어

```bash
npm run dev              # next dev (로컬 개발 서버)
npm run build            # prisma generate && next build
npm run lint             # eslint
npm run db:migrate       # prisma migrate dev
npm run db:seed          # npx tsx prisma/seed.ts (6명 배우 + 10회 공연 샘플)
npm run db:reset         # prisma migrate reset (DB 초기화 + seed 재실행)
npm run db:studio        # prisma studio (DB GUI)
```

## 배포

- `git push origin main` → Vercel 자동 배포 (트리거 안 되면 `npx vercel deploy --prod --yes`)
- **DB 마이그레이션**: Turso 프로덕션 DB에 `@libsql/client`로 직접 DDL 실행 (prisma db push는 sqlite provider라 libsql URL 불가)
- Turso 접속 정보: `npx vercel env pull .env.turso --environment production`으로 가져온 후 사용, 작업 완료 후 반드시 삭제
- **Vercel Cron**: `vercel.json`에 정의, 매일 16:00 UTC (한국 01:00) 메모 자동 정리
- **⚠ Prisma 스키마 변경 시 빌드 캐시 주의**: Vercel `git push` 배포는 이전 빌드 캐시(`node_modules/.prisma/client`)를 재사용하여, `prisma generate`가 실행되어도 캐시된 구 Prisma Client가 사용될 수 있음. 스키마에서 컬럼을 추가/삭제한 경우 반드시 `npx vercel deploy --prod --yes`로 강제 재배포하여 캐시 없이 빌드할 것. 증상: `no such column: main.Table.column` 런타임 에러 (500)

## 아키텍처

### 라우팅 & 권한

```
/login              → 공개 (관리자 비밀번호 / 배우 Google OAuth)
/                   → 리다이렉트 (ADMIN → /admin, ACTOR → /actor)
/admin/*            → ADMIN 전용
/actor/*            → 인증된 사용자 (ACTOR + ADMIN)
/api/*              → 인증 필수 (엔드포인트별 role 체크)
```

`src/middleware.ts`에서 인증 처리. 미들웨어 바이패스 경로:
- `/api/auth/*` — NextAuth 내부 라우트
- `/api/login` — 비밀번호 로그인 API
- `/api/casting/reservations` — 외부 API 키 인증 (RESERVATION_API_KEY)
- `/api/reservations/*` — 외부 API 키 인증 (RESERVATION_API_KEY)
- `/api/cron/*` — Vercel Cron 인증 (CRON_SECRET)

### 데이터 모델 핵심 관계

```
User ←1:1→ Actor (User.actorId, 관리자가 수동 link)
Actor → UnavailableDate[] (performanceDateId FK, 회차 단위)
Actor → Casting[]
Actor → ActorMonthOverride[] (월별 비활성화)
PerformanceDate → Casting[], UnavailableDate[], ReservationStatus?
```

유니크 제약:
- `Casting(performanceDateId, roleType)` — 회차당 역할 1명
- `UnavailableDate(actorId, performanceDateId)` — 중복 불가일정 방지
- `PerformanceDate(date, startTime)` — 회차 중복 방지
- `ReservationStatus(performanceDateId)` — 회차당 예약 상태 1:1
- `ActorMonthOverride(actorId, year, month)` — 배우별 월 비활성화 1건

### 핵심 데이터 패턴: 불가일정은 날짜가 아닌 회차(performanceDateId)

불가일정(`UnavailableDate`)은 날짜 문자열이 아닌 **performanceDateId** FK로 연결된다. API 응답에서도 동일:

```typescript
// /api/schedule 응답의 unavailable 구조
unavailable: Record<actorId, performanceDateId[]>  // ← 날짜 아님, 회차 ID 배열

// /api/unavailable POST 요청 본문
{ actorId: string, performanceDateIds: string[] }  // 기존 대비 diff 계산 → 추가/삭제 트랜잭션
```

### DB 연결 (`src/lib/prisma.ts`)

`TURSO_DATABASE_URL` 환경변수 유무로 분기:
- 있으면 → `PrismaLibSql` 어댑터로 Turso 연결 (프로덕션)
- 없으면 → 기본 SQLite (로컬 개발)

Prisma 클라이언트는 모듈 레벨 싱글톤 패턴 (Vercel serverless 환경에서 커넥션 풀 누수 방지)

### 인증 흐름

두 가지 로그인 경로:

**관리자 (비밀번호)**:
1. `/login`에서 비밀번호 입력 → `POST /api/login`
2. `/api/login`에서 `next-auth/jwt`의 `encode()`로 JWT 생성
3. `__Secure-authjs.session-token` 쿠키에 저장 (30일 유효)
4. 고정 관리자 계정: `{ id: "admin", role: "ADMIN", actorId: null }`

**배우 (Google OAuth)**:
1. `/login`에서 "Google로 로그인" 클릭 → 서버 액션 (`signIn("google", { redirect: false })`)
2. Google OAuth 인증 → `/api/auth/callback/google`
3. Auth.js가 JWT 생성, DB에서 `role`/`actorId` 조회하여 토큰에 주입
4. `ADMIN_EMAILS` 환경변수 기반 자동 role 할당은 최초 가입 시만 적용

**공통**: `src/middleware.ts`에서 `getToken()` (next-auth/jwt)으로 쿠키 검증. 두 경로 모두 동일한 `__Secure-authjs.session-token` 쿠키 사용.

**주의사항**:
- 관리자 JWT는 `/api/login`에서 `encode()` (next-auth/jwt)로 직접 생성 — Auth.js 콜백을 거치지 않음
- Google OAuth 첫 로그인 시 role 할당에 ~100ms 지연 (`setTimeout` 워크어라운드, signIn 콜백)
- 기존 유저 role 변경은 DB 직접 수정 필요

Session 확장 타입 (`src/types/next-auth.d.ts`):
```typescript
user: { id: string; role: "ADMIN" | "ACTOR"; actorId: string | null }
```

### API 엔드포인트

| 엔드포인트 | 메서드 | 권한 | 설명 |
|-----------|--------|------|------|
| `/api/login` | POST | 공개 | 비밀번호 검증 → JWT 쿠키 설정 |
| `/api/schedule?year=&month=` | GET | Auth | 월별 통합 데이터 (performances, castings, unavailable, actors). 해당 월 PerformanceDate 없으면 SHOW_TIMES 기준 자동 생성 |
| `/api/unavailable?actorId=` | GET | Auth | 불가일정 조회 |
| `/api/unavailable` | POST | 본인/ADMIN | performanceDateIds 배열 → 기존 대비 diff 트랜잭션 |
| `/api/casting` | POST | ADMIN | 단건 배정. 배우 roleType + 불가일정 검증 후 upsert. 검증 쿼리 3개 `Promise.all` 병렬 |
| `/api/casting/batch` | POST | ADMIN | 일괄 배정 (reservationName/reservationContact 메모 포함). 필요 데이터 한번에 조회 → Map 검증 → 단일 트랜잭션 |
| `/api/casting/reservations` | POST | API Key | 예약자 메모 자동 등록. n8n → 크롤러 → 이 API. Bearer 토큰 인증 |
| `/api/casting/notify` | POST | ADMIN | 캐스팅 알림 발송 |
| `/api/actors`, `/api/actors/[id]` | GET/POST/PUT/DELETE | Auth/ADMIN | 배우 CRUD |
| `/api/actors/[id]/link` | POST | ADMIN | User ↔ Actor 연결 |
| `/api/actors/calendars` | GET | ADMIN | 배우 캘린더 목록 |
| `/api/actor-override` | POST | ADMIN | 월별 배우 비활성화 |
| `/api/performances` | GET | Auth | 전체 공연일정 + 캐스팅 조회 |
| `/api/reservations/sync` | POST | API Key | 예약 현황 동기화 (크롤러→schedule). 다중 월 지원 |
| `/api/reservations/trigger-sync` | POST | ADMIN | 크롤러 직접 호출하여 예약 동기화 (수동 트리거) |
| `/api/calendar/sync` | POST | ADMIN | synced=false인 항목 Google Calendar 동기화 |
| `/api/cron/cleanup-memos` | GET | CRON_SECRET | 어제 이전 공연 예약 메모 자동 삭제 + 캘린더 description 제거 |

### 예약 연동 흐름

두 가지 경로로 예약 데이터가 연동됨:

**1. 예약 현황 동기화 (ReservationStatus)**
```
관리자 수동: POST /api/reservations/trigger-sync
  → 크롤러 GET /bookings/month (이번달+다음달 예약 조회)
  → ReservationStatus upsert (회차별 예약 유무)

크롤러 자동: POST /api/reservations/sync (API Key 인증)
  → ReservationStatus upsert (회차별 예약 유무)
```

**2. 예약자 메모 등록 (ReservationStatus 필드)**
```
n8n (매일 01:00 KST)
  → POST 크롤러/send-all-notifications (네이버 예약 크롤링 + 알림톡)
    → GET 크롤러/bookings/today (예약 데이터 조회)
      → POST schedule.mysterydam.com/api/casting/reservations (메모 등록 + 캘린더 description)

Vercel Cron (매일 16:00 UTC = 01:00 KST)
  → GET /api/cron/cleanup-memos (과거 공연 메모 삭제, 상대역 이름은 유지)
```

- 크롤러: NAS Docker 컨테이너 (`CRAWLER_URL` 환경변수)
- `ReservationStatus` 모델의 `reservationName`, `reservationContact` 필드에 저장
- MALE_LEAD 캐스팅에만 예약 메모 연결
- `/api/casting/reservations`에서 한국어 시간 파싱 (`parseKoreanTime`: "오후 3:15" → "15:15")

### 캘린더 description 라이프사이클

MALE_LEAD 캘린더 이벤트의 description은 두 종류의 정보를 포함:

```
상대역: 여자배우이름     ← 항상 (배정 즉시)
예약자: 홍길동           ← 공연 당일에만
연락처: 010-1234-5678   ← 공연 당일에만
```

**라이프사이클:**
```
공연 이전:     DB에 메모 저장됨 / 캘린더 = "상대역: OOO"만
공연 당일 01:00: n8n → /api/casting/reservations → 캘린더에 예약 메모 추가
공연 당일 배정:  당일이므로 상대역 + 예약 메모 모두 포함
공연 다음날 01:00: Cron → description에서 예약 메모 제거 (상대역은 유지)
```

**상대역 자동 갱신:** FEMALE_LEAD 배정/변경/해제 시 같은 회차 MALE_LEAD의 캘린더 description이 자동 갱신됨. `buildCastingDescription()` (`src/lib/schedule.ts`)으로 조합.

### 컴포넌트 구조

- **서버 컴포넌트**: `src/app/*/page.tsx` — Prisma 직접 쿼리, `auth()` 인증 체크
- **클라이언트 컴포넌트**: `src/components/*.tsx` ("use client") — 달력 UI, Dialog, `fetch` API 호출
- **공유 달력**: `ScheduleCalendar` — `renderCell(dateStr, day)` / `onCellClick(dateStr)` 콜백 패턴
- **UI 프리미티브**: `src/components/ui/` — shadcn/ui (Radix + Tailwind)
- **로딩 스켈레톤**: 각 라우트 세그먼트별 `loading.tsx` (admin, admin/actors, admin/casting, actor)

데이터 흐름: 서버 컴포넌트가 페이지 셸 렌더 → 클라이언트 캘린더 컴포넌트가 `/api/schedule` fetch → 월별 데이터로 렌더

### 예약 취소 충돌 상태 (Cancellation Conflict)

`CastingCalendar`에서 `hasReservation === false && (배역 배정 존재)` 충돌을 감지하여 오렌지 경고 표시:
- 캘린더 셀: 오렌지 배경 + ⚠ 아이콘 + "예약취소 N" 뱃지
- 다이얼로그: 오렌지 테두리 + AlertTriangle + "배정 해제를 검토하세요" 안내
- 충돌 상태에서도 Select/Input 활성화 → 관리자가 "미배정" 선택 가능

### 공유 유틸리티 (`src/lib/schedule.ts`)

- `ensureAndGetMonthPerformances(year, month)` — 해당 월 PerformanceDate가 부족하면 SHOW_TIMES 기준으로 자동 생성 후 반환. `/api/schedule`, `/api/reservations/sync`, `/api/reservations/trigger-sync`에서 공통 사용
- `buildCastingDescription({ partnerName?, reservationName?, reservationContact? })` — MALE_LEAD 캘린더 description 조합 (상대역 + 예약메모). 모든 캘린더 이벤트 생성/갱신에서 공통 사용
- `getMonthDates(year, month)` — YYYY-MM-DD 형식 날짜 배열 생성
- `formatPerformanceDate(date)` — "M/d (EEE)" 한국어 포맷
- `formatPerformanceDateTime(date, startTime, endTime?)` — 시간 범위 포함 포맷

### 상수 (`src/lib/constants.ts`)

```typescript
SHOW_TIMES = ["10:45", "13:00", "15:15", "17:30", "19:45"]  // 하루 5회차
SHOW_TIME_LABELS = { "10:45": "1회 10:45", ... }
```

역할 타입 (`src/types/index.ts`): `MALE_LEAD`("남1"), `FEMALE_LEAD`("여1")

### Google Calendar 연동 (`src/lib/google-calendar.ts`)

`@googleapis/calendar` + `google-auth-library` (Service Account JWT). Auth 인스턴스 모듈 레벨 캐싱 (serverless 재사용).

- 불가일정 → 배우 개인 캘린더(`Actor.calendarId`)에 종일 이벤트 (빨강 colorId:11)
- 배정 → 배우 개인 캘린더에 시간 이벤트 (파랑:9 남자 / 보라:6 여자) + 전체배우일정 캘린더(`CALENDAR_ALL_ACTORS`)에 미러링
- MALE_LEAD description → 상대역(항상) + 예약메모(당일만). `buildCastingDescription()`으로 조합
- `synced` + `calendarEventId` + `allCalendarEventId` 필드로 동기화 상태 추적
- `updateEventDescription()` / `updateAllCalendarDescription()` — 기존 이벤트의 description만 patch
- `/api/calendar/sync`에서 관리자 수동 트리거

## 환경변수

`.env.example` 참조. 프로덕션은 Vercel Dashboard 또는 `npx vercel env` CLI로 관리.

필수:
- `DATABASE_URL` — SQLite 경로 (로컬)
- `NEXTAUTH_SECRET` — JWT 암호화/복호화 키 (관리자·배우 공통)
- `NEXTAUTH_URL` — OAuth 콜백 기준 URL (로컬: `http://localhost:3000`)
- `ADMIN_PASSWORD` — 관리자 로그인 비밀번호 (Vercel CLI로 설정 시 `printf '%s'` 사용, `echo` 금지 — 줄바꿈 주의)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — 배우 Google OAuth 인증
- `ADMIN_EMAILS` — 쉼표 구분 관리자 이메일 (최초 가입 시 role 자동 할당)

프로덕션 전용:
- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` — Turso DB
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` — Calendar API
- `CALENDAR_MALE_LEAD`, `CALENDAR_FEMALE_LEAD` — 역할 캘린더 ID (현재 미사용, 개인 캘린더로 대체)
- `CALENDAR_ALL_ACTORS` — 전체배우일정 캘린더 ID (미러링 대상)
- `RESERVATION_API_KEY` — 크롤러→schedule 예약 API 인증 (`/api/casting/reservations`, `/api/reservations/sync`)
- `CRAWLER_URL` — 네이버 예약 크롤러 URL (`/api/reservations/trigger-sync`에서 직접 호출)
- `CRON_SECRET` — Vercel Cron 인증

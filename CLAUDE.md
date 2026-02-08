# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

공연 스케줄 관리 & 배역 배정 웹앱. 배우들이 회차별 불가일정을 등록하고, 관리자(연출)가 배역을 수동 배정하는 시스템. Google Calendar 양방향 연동.

**프로덕션 URL**: https://schedule.mysterydam.com

## 기술 스택

- **프레임워크**: Next.js 16 (App Router) + React 19
- **언어**: TypeScript
- **DB**: SQLite (로컬) + Turso/LibSQL (프로덕션, `@prisma/adapter-libsql`)
- **ORM**: Prisma 6
- **인증**: Auth.js v5 (next-auth beta.30) + Google OAuth
- **캘린더**: Google Calendar API (Service Account, googleapis)
- **UI**: Tailwind CSS v4 + shadcn/ui (Radix UI)

## 개발 명령어

```bash
npm run build            # prisma generate && next build
npm run db:migrate       # prisma migrate dev
npm run db:seed          # npx tsx prisma/seed.ts
npm run db:studio        # prisma studio
npm run lint             # eslint
```

## 배포 & 테스트 규칙

- **테스트는 반드시 프로덕션 서버에서 수행**: 코드 변경 → 커밋 → `git push origin main` → Vercel 자동 배포 → 프로덕션 URL에서 확인
- Vercel 자동 배포가 트리거되지 않으면 `npx vercel deploy --prod --yes`로 수동 배포
- **DB 마이그레이션**: 스키마 변경 시 Turso 프로덕션 DB에 `@libsql/client`로 직접 DDL 실행 (prisma db push는 sqlite provider라 libsql URL 불가)
- Turso 접속 정보: `npx vercel env pull .env.turso --environment production`으로 가져온 후 사용, 작업 완료 후 반드시 삭제

## 아키텍처

### 라우팅 & 권한

```
/login              → 공개 (Google OAuth)
/admin/*            → ADMIN 전용 (middleware가 role 체크)
/actor/*            → 인증된 사용자 (ACTOR + ADMIN)
/api/*              → 인증 필수 (엔드포인트별 role 체크)
```

`middleware.ts`가 인증/권한 가드 담당. 비인증 → `/login`, 비관리자 → `/actor` 리다이렉트.

### 데이터 모델 핵심 관계

- `User` ↔ `Actor`: 1:1 (User.actorId로 연결, 관리자가 수동 link)
- `Actor` → `UnavailableDate[]`: 회차별 불가일정 (`performanceDateId` FK)
- `Actor` → `Casting[]`: 배역 배정
- `PerformanceDate` → `Casting[]`, `UnavailableDate[]`
- 유니크 제약: `Casting(performanceDateId, roleType)`, `UnavailableDate(actorId, performanceDateId)`, `PerformanceDate(date, startTime)`

### DB 연결 패턴 (`src/lib/prisma.ts`)

`TURSO_DATABASE_URL` 환경변수 유무로 분기:
- 있으면 → `PrismaLibSql` 어댑터로 Turso 연결 (프로덕션)
- 없으면 → 기본 SQLite (로컬 개발)

### 인증 흐름 (`src/lib/auth.ts`)

Auth.js v5 JWT 전략. JWT callback에서 DB 조회하여 `role`, `actorId`를 토큰에 주입. Session callback에서 클라이언트에 전달. `ADMIN_EMAILS` 환경변수 기반 자동 role 할당은 최초 가입 시만 적용 → 기존 유저 role 변경은 DB 직접 수정 필요.

### API 패턴

- `/api/schedule?year=&month=`: 월별 통합 데이터 반환 (performances, castings, unavailable, actors). 해당 월 PerformanceDate 없으면 SHOW_TIMES 기준 자동 생성.
- `/api/unavailable`: POST는 `performanceDateIds` 배열을 받아 기존 대비 diff(추가/삭제) 트랜잭션 처리.
- `/api/casting`: POST 시 배우 roleType 일치 + 불가일정 미등록 검증 후 upsert.

### 컴포넌트 구조

- **서버 컴포넌트**: `src/app/*/page.tsx` - Prisma 직접 쿼리, 인증 체크
- **클라이언트 컴포넌트**: `src/components/*.tsx` ("use client") - 달력 UI, Dialog, 상태 관리
- **공유 달력 위젯**: `ScheduleCalendar` - renderCell/onCellClick 콜백으로 용도별 커스텀
- **UI 프리미티브**: `src/components/ui/` - shadcn/ui (Radix + Tailwind)

### 공연 시간표 (상수)

```typescript
// src/lib/constants.ts
SHOW_TIMES = ["10:45", "13:00", "15:15", "17:30", "19:45"]  // 하루 5회차
```

### Google Calendar 연동 (`src/lib/google-calendar.ts`)

Service Account JWT 인증. 불가일정 → 배우 개인 캘린더에 종일 이벤트(빨강). 배정 → 역할별 캘린더에 시간 이벤트(남1: 파랑, 여1: 보라). `synced`/`calendarEventId` 필드로 동기화 상태 추적.

## 환경변수

`.env.example` 참조. 프로덕션 환경변수는 Vercel Dashboard 또는 `npx vercel env` CLI로 관리.

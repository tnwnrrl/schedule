# 공연 스케줄 관리 & 배역 배정 웹앱

## 프로젝트 개요
배우들이 불가능한 날짜를 등록하고, 관리자(연출)가 배역을 수동 배정하는 웹 시스템.
Google Calendar과 양방향 연동하여 배우 개인 불가 일정과 배역 확정 일정을 관리.

## 기술 스택
- **프레임워크**: Next.js 16 (App Router) + React 19
- **언어**: TypeScript
- **DB**: SQLite + Prisma 6
- **인증**: Auth.js v5 + Google OAuth
- **캘린더**: Google Calendar API (Service Account)
- **UI**: Tailwind CSS v4 + shadcn/ui

## 개발 명령어
```bash
npm run dev          # 개발 서버
npm run build        # 프로덕션 빌드
npm run db:migrate   # Prisma 마이그레이션
npm run db:seed      # 시드 데이터
npm run db:studio    # Prisma Studio
```

## 데이터 모델
- **User**: Auth.js 사용자 (ADMIN/ACTOR)
- **Actor**: 배우 프로필 (MALE_LEAD/FEMALE_LEAD)
- **PerformanceDate**: 공연 일정
- **UnavailableDate**: 배우 불가일정
- **Casting**: 배역 배정 (@@unique: performanceDateId + roleType)

## 배포 & 테스트 규칙
- **테스트는 반드시 프로덕션 서버에서 수행**: 로컬 `npm run dev` 대신, 코드 변경 후 커밋 → push → Vercel 자동 배포 후 프로덕션 URL에서 테스트
- **배포 흐름**: `git push origin main` → Vercel 자동 빌드/배포 → 프로덕션 확인
- **DB 마이그레이션**: 스키마 변경 시 Turso 프로덕션 DB에도 `@libsql/client`로 직접 DDL 실행

## 환경변수
`.env.example` 참조. `.env.local`에 실제 값 설정.

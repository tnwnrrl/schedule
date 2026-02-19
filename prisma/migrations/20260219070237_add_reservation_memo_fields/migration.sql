/*
  Warnings:

  - You are about to drop the column `date` on the `UnavailableDate` table. All the data in the column will be lost.
  - Added the required column `performanceDateId` to the `UnavailableDate` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Casting" ADD COLUMN "reservationContact" TEXT;
ALTER TABLE "Casting" ADD COLUMN "reservationName" TEXT;

-- CreateTable
CREATE TABLE "ActorMonthOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActorMonthOverride_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UnavailableDate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "performanceDateId" TEXT NOT NULL,
    "synced" BOOLEAN NOT NULL DEFAULT false,
    "calendarEventId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UnavailableDate_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UnavailableDate_performanceDateId_fkey" FOREIGN KEY ("performanceDateId") REFERENCES "PerformanceDate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UnavailableDate" ("actorId", "calendarEventId", "createdAt", "id", "synced") SELECT "actorId", "calendarEventId", "createdAt", "id", "synced" FROM "UnavailableDate";
DROP TABLE "UnavailableDate";
ALTER TABLE "new_UnavailableDate" RENAME TO "UnavailableDate";
CREATE INDEX "UnavailableDate_performanceDateId_idx" ON "UnavailableDate"("performanceDateId");
CREATE UNIQUE INDEX "UnavailableDate_actorId_performanceDateId_key" ON "UnavailableDate"("actorId", "performanceDateId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ActorMonthOverride_year_month_idx" ON "ActorMonthOverride"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "ActorMonthOverride_actorId_year_month_key" ON "ActorMonthOverride"("actorId", "year", "month");

-- CreateIndex
CREATE INDEX "Casting_performanceDateId_idx" ON "Casting"("performanceDateId");

-- CreateIndex
CREATE INDEX "Casting_actorId_idx" ON "Casting"("actorId");

-- CreateIndex
CREATE INDEX "PerformanceDate_date_idx" ON "PerformanceDate"("date");

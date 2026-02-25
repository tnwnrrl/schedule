/*
  Warnings:

  - You are about to drop the column `reservationContact` on the `Casting` table. All the data in the column will be lost.
  - You are about to drop the column `reservationName` on the `Casting` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ReservationStatus" ADD COLUMN "reservationContact" TEXT;
ALTER TABLE "ReservationStatus" ADD COLUMN "reservationName" TEXT;

-- DataMigration: Copy memo data from Casting (MALE_LEAD) to ReservationStatus
UPDATE "ReservationStatus" SET
  "reservationName" = (SELECT c."reservationName" FROM "Casting" c WHERE c."performanceDateId" = "ReservationStatus"."performanceDateId" AND c."roleType" = 'MALE_LEAD'),
  "reservationContact" = (SELECT c."reservationContact" FROM "Casting" c WHERE c."performanceDateId" = "ReservationStatus"."performanceDateId" AND c."roleType" = 'MALE_LEAD')
WHERE "performanceDateId" IN (
  SELECT "performanceDateId" FROM "Casting" WHERE "reservationName" IS NOT NULL AND "roleType" = 'MALE_LEAD'
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Casting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "performanceDateId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "roleType" TEXT NOT NULL,
    "synced" BOOLEAN NOT NULL DEFAULT false,
    "calendarEventId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Casting_performanceDateId_fkey" FOREIGN KEY ("performanceDateId") REFERENCES "PerformanceDate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Casting_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Casting" ("actorId", "calendarEventId", "createdAt", "id", "performanceDateId", "roleType", "synced", "updatedAt") SELECT "actorId", "calendarEventId", "createdAt", "id", "performanceDateId", "roleType", "synced", "updatedAt" FROM "Casting";
DROP TABLE "Casting";
ALTER TABLE "new_Casting" RENAME TO "Casting";
CREATE INDEX "Casting_performanceDateId_idx" ON "Casting"("performanceDateId");
CREATE INDEX "Casting_actorId_idx" ON "Casting"("actorId");
CREATE UNIQUE INDEX "Casting_performanceDateId_roleType_key" ON "Casting"("performanceDateId", "roleType");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

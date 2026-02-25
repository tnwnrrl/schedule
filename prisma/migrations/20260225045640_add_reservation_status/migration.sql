-- CreateTable
CREATE TABLE "ReservationStatus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "performanceDateId" TEXT NOT NULL,
    "hasReservation" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReservationStatus_performanceDateId_fkey" FOREIGN KEY ("performanceDateId") REFERENCES "PerformanceDate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ReservationStatus_performanceDateId_key" ON "ReservationStatus"("performanceDateId");

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('ONLINE', 'DASHBOARD', 'WALK_IN');

-- CreateEnum
CREATE TYPE "QueueState" AS ENUM ('WAITING', 'SERVING', 'DONE', 'NO_SHOW', 'MOVED');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "carriedFromId" TEXT,
ADD COLUMN     "notPresentCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "queuePosition" INTEGER,
ADD COLUMN     "queueState" "QueueState",
ADD COLUMN     "servingStartedAt" TIMESTAMPTZ(3),
ADD COLUMN     "source" "BookingSource" NOT NULL DEFAULT 'ONLINE';

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_carriedFromId_key" ON "Appointment"("carriedFromId");

-- CreateIndex
CREATE INDEX "Appointment_businessId_sessionDate_queuePosition_idx" ON "Appointment"("businessId", "sessionDate", "queuePosition");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_carriedFromId_fkey" FOREIGN KEY ("carriedFromId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;


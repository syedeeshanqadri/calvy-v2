-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "estimatedAt" TIMESTAMPTZ(3),
ADD COLUMN     "sessionDate" DATE,
ADD COLUMN     "tokenNumber" INTEGER,
ADD COLUMN     "tokenSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_tokenSessionId_sessionDate_tokenNumber_key" ON "Appointment"("tokenSessionId", "sessionDate", "tokenNumber");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_tokenSessionId_fkey" FOREIGN KEY ("tokenSessionId") REFERENCES "TokenSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;


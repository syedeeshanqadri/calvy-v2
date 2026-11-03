ALTER TABLE "Business" ADD COLUMN "followUpDays" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Appointment" ADD COLUMN "followUpOfId" TEXT;
CREATE UNIQUE INDEX "Appointment_followUpOfId_key" ON "Appointment"("followUpOfId");
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_followUpOfId_fkey" FOREIGN KEY ("followUpOfId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

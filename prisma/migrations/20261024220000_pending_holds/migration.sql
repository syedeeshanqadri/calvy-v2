-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "holdExpiresAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "refundedMinor" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Appointment_status_holdExpiresAt_idx" ON "Appointment"("status", "holdExpiresAt");

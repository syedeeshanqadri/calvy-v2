-- CreateIndex
CREATE INDEX "Appointment_businessId_status_date_idx" ON "Appointment"("businessId", "status", "date");


-- Staff can set the meeting link on an individual online appointment.
ALTER TABLE "Appointment" ADD COLUMN "meetingUrl" TEXT;

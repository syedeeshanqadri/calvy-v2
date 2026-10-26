-- Online consultations: service mode, meeting links (staff default, service override), per-booking flag.
CREATE TYPE "ServiceMode" AS ENUM ('IN_PERSON', 'ONLINE', 'BOTH');

ALTER TABLE "Service" ADD COLUMN "mode" "ServiceMode" NOT NULL DEFAULT 'IN_PERSON',
ADD COLUMN "meetingUrl" TEXT;

ALTER TABLE "Staff" ADD COLUMN "meetingUrl" TEXT;

ALTER TABLE "Appointment" ADD COLUMN "isOnline" BOOLEAN NOT NULL DEFAULT false;

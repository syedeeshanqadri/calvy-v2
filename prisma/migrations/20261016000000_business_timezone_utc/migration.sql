-- S2-01: business timezone + true UTC instants for appointments.
-- Existing wall-clock times were saved as if they were UTC but meant IST
-- (demo data only, owner-approved), so they are reinterpreted as Asia/Kolkata.

-- AlterTable
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';

-- AlterTable: guarded so a re-run never shifts the instants a second time.
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'Appointment' AND column_name = 'date')
     = 'timestamp without time zone' THEN
    ALTER TABLE "Appointment"
      ALTER COLUMN "date" TYPE TIMESTAMPTZ(3) USING ("date" AT TIME ZONE 'Asia/Kolkata');
  END IF;
END $$;

ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "endAt" TIMESTAMPTZ(3);
UPDATE "Appointment" SET "endAt" = "date" + ("duration" * INTERVAL '1 minute') WHERE "endAt" IS NULL;
ALTER TABLE "Appointment" ALTER COLUMN "endAt" SET NOT NULL;

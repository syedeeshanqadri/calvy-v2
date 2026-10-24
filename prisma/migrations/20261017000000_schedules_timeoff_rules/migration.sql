-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "cancellationCutoffHours" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "maxAdvanceDays" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "minNoticeMinutes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "bufferAfterMin" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bufferBeforeMin" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "bufferAfterMin" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bufferBeforeMin" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "WorkingHours" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "staffId" TEXT,
    "weekday" INTEGER NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,

    CONSTRAINT "WorkingHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeOff" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "staffId" TEXT,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkingHours_businessId_staffId_weekday_idx" ON "WorkingHours"("businessId", "staffId", "weekday");

-- AddForeignKey
ALTER TABLE "WorkingHours" ADD CONSTRAINT "WorkingHours_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkingHours" ADD CONSTRAINT "WorkingHours_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeOff" ADD CONSTRAINT "TimeOff_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeOff" ADD CONSTRAINT "TimeOff_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── Backfill (idempotent: only touches businesses/staff that have no rows yet) ──

-- Business hours from Business.availabilityJson ({"0".."6": {enabled,start,end}}).
-- Empty / malformed JSON falls back to Mon-Fri 09:00-18:00, what the old route assumed.
CREATE FUNCTION pg_temp.hhmm_to_min(v text, fallback int) RETURNS int AS $$
BEGIN
  IF v ~ '^[0-9]{1,2}:[0-9]{2}$' THEN
    RETURN split_part(v, ':', 1)::int * 60 + split_part(v, ':', 2)::int;
  END IF;
  RETURN fallback;
END $$ LANGUAGE plpgsql;

DO $$
DECLARE
  b RECORD;
  j jsonb;
  d int;
  cfg jsonb;
  s int;
  e int;
BEGIN
  FOR b IN SELECT "id", "availabilityJson" FROM "Business"
           WHERE NOT EXISTS (SELECT 1 FROM "WorkingHours" w WHERE w."businessId" = "Business"."id" AND w."staffId" IS NULL)
  LOOP
    BEGIN
      j := b."availabilityJson"::jsonb;
      IF jsonb_typeof(j) <> 'object' THEN j := '{}'::jsonb; END IF;
    EXCEPTION WHEN others THEN
      j := '{}'::jsonb;
    END;
    FOR d IN 0..6 LOOP
      cfg := j -> d::text;
      IF cfg IS NULL OR jsonb_typeof(cfg) <> 'object' THEN
        IF d BETWEEN 1 AND 5 THEN
          INSERT INTO "WorkingHours" ("id", "businessId", "staffId", "weekday", "startMin", "endMin")
          VALUES (gen_random_uuid()::text, b."id", NULL, d, 540, 1080);
        END IF;
      ELSIF (cfg ->> 'enabled') = 'true' THEN
        s := pg_temp.hhmm_to_min(cfg ->> 'start', 540);
        e := pg_temp.hhmm_to_min(cfg ->> 'end', 1080);
        IF e > s THEN
          INSERT INTO "WorkingHours" ("id", "businessId", "staffId", "weekday", "startMin", "endMin")
          VALUES (gen_random_uuid()::text, b."id", NULL, d, s, e);
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Staff hours from Staff.workingHours ({monday: {start,end,isWorking}, ...}).
-- Only non-default schedules become rows; staff on the platform default keep
-- inheriting business hours, which is what the old booking page did.
DO $$
DECLARE
  st RECORD;
  j jsonb;
  default_json CONSTANT jsonb := '{"monday":{"start":"09:00","end":"18:00","isWorking":true},"tuesday":{"start":"09:00","end":"18:00","isWorking":true},"wednesday":{"start":"09:00","end":"18:00","isWorking":true},"thursday":{"start":"09:00","end":"18:00","isWorking":true},"friday":{"start":"09:00","end":"17:00","isWorking":true},"saturday":{"start":"10:00","end":"14:00","isWorking":true},"sunday":{"isWorking":false}}'::jsonb;
  names text[] := ARRAY['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  d int;
  cfg jsonb;
  s int;
  e int;
BEGIN
  FOR st IN SELECT "id", "businessId", "workingHours" FROM "Staff"
            WHERE NOT EXISTS (SELECT 1 FROM "WorkingHours" w WHERE w."staffId" = "Staff"."id")
  LOOP
    BEGIN
      j := st."workingHours"::jsonb;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;
    IF jsonb_typeof(j) <> 'object' OR j = '{}'::jsonb OR j = default_json THEN CONTINUE; END IF;
    FOR d IN 0..6 LOOP
      cfg := j -> names[d + 1];
      IF cfg IS NOT NULL AND jsonb_typeof(cfg) = 'object' AND (cfg ->> 'isWorking') = 'true' THEN
        s := pg_temp.hhmm_to_min(cfg ->> 'start', 540);
        e := pg_temp.hhmm_to_min(cfg ->> 'end', 1080);
        IF e > s THEN
          INSERT INTO "WorkingHours" ("id", "businessId", "staffId", "weekday", "startMin", "endMin")
          VALUES (gen_random_uuid()::text, st."businessId", st."id", d, s, e);
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Staff are offered only for services they are linked to. Services with no
-- links yet get every active staff member of their business.
INSERT INTO "StaffService" ("staffId", "serviceId")
SELECT st."id", sv."id"
FROM "Service" sv
JOIN "Staff" st ON st."businessId" = sv."businessId" AND st."isActive" = true
WHERE NOT EXISTS (SELECT 1 FROM "StaffService" x WHERE x."serviceId" = sv."id")
ON CONFLICT DO NOTHING;

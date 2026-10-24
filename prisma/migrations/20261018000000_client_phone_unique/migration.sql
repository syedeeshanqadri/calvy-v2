-- S2-08 slice: phone-only clients, normalised phones, unique phone per business,
-- and a staff backfill for old unassigned appointments.
--
-- Safe by construction: no appointment is ever deleted. Duplicate clients are
-- merged (appointments repointed first) or, when two different people share a
-- number, the later record loses the phone and keeps it in its notes.
-- Country code comes from the business timezone, mirroring lib/phone.ts.

-- 1. Email becomes optional (a client may be reachable by phone only).
ALTER TABLE "Client" ALTER COLUMN "email" DROP NOT NULL;

-- 2. Blank phones are NULL (NULLs never collide in a unique index).
UPDATE "Client" SET "phone" = NULL WHERE "phone" IS NOT NULL AND btrim("phone") = '';

-- 3. Normalise to E.164. A value that cannot be a phone number is cleared and
--    kept in notes so nothing is lost.
WITH base AS (
  SELECT c."id", c."phone" AS raw,
    regexp_replace(c."phone", '[^0-9]', '', 'g') AS digits,
    (btrim(c."phone") LIKE '+%') AS plus,
    CASE
      WHEN b."timezone" IN ('Asia/Kolkata', 'Asia/Calcutta') THEN '91'
      WHEN b."timezone" = 'Asia/Dubai' THEN '971'
      WHEN b."timezone" = 'Asia/Karachi' THEN '92'
      WHEN b."timezone" = 'Asia/Dhaka' THEN '880'
      WHEN b."timezone" = 'Asia/Colombo' THEN '94'
      WHEN b."timezone" = 'Asia/Kathmandu' THEN '977'
      WHEN b."timezone" = 'Asia/Singapore' THEN '65'
      WHEN b."timezone" = 'Asia/Riyadh' THEN '966'
      WHEN b."timezone" = 'Europe/London' THEN '44'
      WHEN b."timezone" = 'Europe/Berlin' THEN '49'
      WHEN b."timezone" = 'Europe/Paris' THEN '33'
      WHEN b."timezone" = 'Pacific/Auckland' THEN '64'
      WHEN b."timezone" = 'Africa/Lagos' THEN '234'
      WHEN b."timezone" = 'Africa/Nairobi' THEN '254'
      WHEN b."timezone" = 'Africa/Johannesburg' THEN '27'
      WHEN b."timezone" = 'America/Sao_Paulo' THEN '55'
      WHEN b."timezone" = 'America/Mexico_City' THEN '52'
      WHEN b."timezone" LIKE 'America/%' THEN '1'
      WHEN b."timezone" LIKE 'Australia/%' THEN '61'
      ELSE '91'
    END AS cc
  FROM "Client" c JOIN "Business" b ON b."id" = c."businessId"
  WHERE c."phone" IS NOT NULL
), norm AS (
  SELECT id, raw,
    CASE
      WHEN digits = '' THEN NULL
      WHEN plus THEN '+' || digits
      WHEN digits LIKE '00%' THEN '+' || substr(digits, 3)
      WHEN length(digits) >= 11 AND digits LIKE cc || '%' THEN '+' || digits
      ELSE '+' || cc || ltrim(digits, '0')
    END AS e164
  FROM base
), valid AS (
  SELECT id, raw, CASE WHEN length(e164) BETWEEN 9 AND 16 THEN e164 END AS e164 FROM norm
)
UPDATE "Client" c
SET "phone" = v.e164,
    "notes" = CASE WHEN v.e164 IS NULL
                   THEN btrim(coalesce(c."notes", '') || E'\nOriginal phone (not a valid number): ' || v.raw)
                   ELSE c."notes" END
FROM valid v
WHERE v."id" = c."id" AND c."phone" IS DISTINCT FROM v.e164;

-- 4. Same phone AND same name = same person. Repoint appointments to the oldest
--    record, carry over totals and the other emails, then drop the empty copies.
WITH ranked AS (
  SELECT "id", FIRST_VALUE("id") OVER (
           PARTITION BY "businessId", "phone", lower(btrim("name")) ORDER BY "createdAt", "id") AS keep_id
  FROM "Client" WHERE "phone" IS NOT NULL
), dups AS (SELECT "id", keep_id FROM ranked WHERE "id" <> keep_id)
UPDATE "Appointment" a SET "clientId" = d.keep_id FROM dups d WHERE a."clientId" = d."id";

WITH ranked AS (
  SELECT "id", FIRST_VALUE("id") OVER (
           PARTITION BY "businessId", "phone", lower(btrim("name")) ORDER BY "createdAt", "id") AS keep_id
  FROM "Client" WHERE "phone" IS NOT NULL
), dups AS (SELECT "id", keep_id FROM ranked WHERE "id" <> keep_id),
agg AS (
  SELECT d.keep_id,
         SUM(c."totalAppointments") AS ta,
         SUM(c."totalSpent") AS ts,
         MAX(c."lastVisit") AS lv,
         string_agg(c."email", ', ') FILTER (WHERE c."email" IS NOT NULL) AS emails
  FROM "Client" c JOIN dups d ON d."id" = c."id"
  GROUP BY d.keep_id
)
UPDATE "Client" k
SET "totalAppointments" = k."totalAppointments" + agg.ta,
    "totalSpent" = k."totalSpent" + agg.ts,
    "lastVisit" = GREATEST(k."lastVisit", agg.lv),
    "notes" = CASE WHEN agg.emails IS NULL THEN k."notes"
                   ELSE btrim(coalesce(k."notes", '') || E'\nMerged duplicate, other email(s): ' || agg.emails) END
FROM agg WHERE k."id" = agg.keep_id;

WITH ranked AS (
  SELECT "id", FIRST_VALUE("id") OVER (
           PARTITION BY "businessId", "phone", lower(btrim("name")) ORDER BY "createdAt", "id") AS keep_id
  FROM "Client" WHERE "phone" IS NOT NULL
)
DELETE FROM "Client" c USING ranked r
WHERE r."id" = c."id" AND r."id" <> r.keep_id
  AND NOT EXISTS (SELECT 1 FROM "Appointment" a WHERE a."clientId" = c."id");

-- 5. Different people sharing one number: the oldest keeps it, the others keep
--    it as a note only (flagged for the owner).
WITH r AS (
  SELECT "id", "phone", ROW_NUMBER() OVER (PARTITION BY "businessId", "phone" ORDER BY "createdAt", "id") AS rn
  FROM "Client" WHERE "phone" IS NOT NULL
)
UPDATE "Client" c
SET "notes" = btrim(coalesce(c."notes", '') || E'\nShared phone (kept on an older client): ' || r."phone"),
    "phone" = NULL
FROM r WHERE r."id" = c."id" AND r.rn > 1;

-- 6. One client per phone within a business.
CREATE UNIQUE INDEX "Client_businessId_phone_key" ON "Client"("businessId", "phone");

-- 7. Old unassigned appointments (demo rows, early owner bookings) go to the
--    business's first active staff member, falling back to the first staff member.
UPDATE "Appointment" a
SET "staffId" = (
  SELECT s."id" FROM "Staff" s
  WHERE s."businessId" = a."businessId"
  ORDER BY s."isActive" DESC, s."createdAt" ASC, s."id" ASC
  LIMIT 1
)
WHERE a."staffId" IS NULL
  AND EXISTS (SELECT 1 FROM "Staff" s WHERE s."businessId" = a."businessId");

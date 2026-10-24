-- CreateEnum
CREATE TYPE "PackId" AS ENUM ('CLINIC', 'SALON_SPA', 'LAWYER', 'FITNESS', 'OTHER');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN "packId" "PackId" NOT NULL DEFAULT 'OTHER',
ADD COLUMN "termsOverride" JSONB;

-- Backfill packId from the legacy businessType string
UPDATE "Business" SET "packId" = CASE "businessType"
  WHEN 'clinic' THEN 'CLINIC'::"PackId"
  WHEN 'dental' THEN 'CLINIC'::"PackId"
  WHEN 'physio' THEN 'CLINIC'::"PackId"
  WHEN 'therapy' THEN 'CLINIC'::"PackId"
  WHEN 'salon' THEN 'SALON_SPA'::"PackId"
  WHEN 'barbershop' THEN 'SALON_SPA'::"PackId"
  WHEN 'spa' THEN 'SALON_SPA'::"PackId"
  WHEN 'beauty' THEN 'SALON_SPA'::"PackId"
  WHEN 'tattoo' THEN 'SALON_SPA'::"PackId"
  WHEN 'fitness' THEN 'FITNESS'::"PackId"
  WHEN 'lawyer' THEN 'LAWYER'::"PackId"
  ELSE 'OTHER'::"PackId"
END;

-- AlterTable
ALTER TABLE "PlanConfig" ADD COLUMN     "offers" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BusinessOffer" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "percent" INTEGER NOT NULL,
    "nth" INTEGER,
    "days" INTEGER[],
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "serviceIds" TEXT[],
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "showOnSite" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessOffer_businessId_active_idx" ON "BusinessOffer"("businessId", "active");

-- AddForeignKey
ALTER TABLE "BusinessOffer" ADD CONSTRAINT "BusinessOffer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Offers & discounts are on for the paid plans (editable in /admin/plans)
UPDATE "PlanConfig" SET "offers" = true WHERE "planId" IN ('professional', 'business');

-- CreateEnum
CREATE TYPE "BookingMode" AS ENUM ('SLOT', 'TOKEN');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "bookingMode" "BookingMode" NOT NULL DEFAULT 'SLOT';

-- CreateTable
CREATE TABLE "TokenSession" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "staffId" TEXT,
    "name" TEXT NOT NULL,
    "weekdays" INTEGER[],
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "minutesPerToken" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TokenSession_businessId_staffId_idx" ON "TokenSession"("businessId", "staffId");

-- AddForeignKey
ALTER TABLE "TokenSession" ADD CONSTRAINT "TokenSession_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenSession" ADD CONSTRAINT "TokenSession_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

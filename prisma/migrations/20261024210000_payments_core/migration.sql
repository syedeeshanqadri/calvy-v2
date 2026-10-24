-- CreateEnum
CREATE TYPE "OnlinePayMode" AS ENUM ('BOOKING_FEE_ONLY', 'FULL_ONLINE');

-- CreateEnum
CREATE TYPE "FeePayer" AS ENUM ('CUSTOMER', 'BUSINESS');

-- CreateEnum
CREATE TYPE "PayProvider" AS ENUM ('MOCK', 'CASHFREE');

-- CreateEnum
CREATE TYPE "PayStatus" AS ENUM ('CREATED', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "FeeEntryKind" AS ENUM ('CHARGED', 'CARRIED_OVER', 'WAIVED', 'REFUNDED');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "feePayer" "FeePayer" NOT NULL DEFAULT 'CUSTOMER',
ADD COLUMN     "onlinePayMode" "OnlinePayMode" NOT NULL DEFAULT 'BOOKING_FEE_ONLY';

-- AlterTable
ALTER TABLE "PlanConfig" ADD COLUMN     "platformFeeMinorIN" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "provider" "PayProvider" NOT NULL,
    "providerOrderId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "platformFeeMinor" INTEGER NOT NULL,
    "businessShareMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PayStatus" NOT NULL DEFAULT 'CREATED',
    "method" TEXT,
    "paymentRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformFeeEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "paymentId" TEXT,
    "kind" "FeeEntryKind" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformFeeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" "PayProvider" NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerOrderId_key" ON "Payment"("providerOrderId");

-- CreateIndex
CREATE INDEX "Payment_businessId_createdAt_idx" ON "Payment"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_appointmentId_idx" ON "Payment"("appointmentId");

-- CreateIndex
CREATE INDEX "PlatformFeeEntry_businessId_createdAt_idx" ON "PlatformFeeEntry"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_eventId_key" ON "WebhookEvent"("provider", "eventId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformFeeEntry" ADD CONSTRAINT "PlatformFeeEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformFeeEntry" ADD CONSTRAINT "PlatformFeeEntry_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformFeeEntry" ADD CONSTRAINT "PlatformFeeEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Free plan: Rs 10 (1000 paise) platform fee per public online booking in India; paid plans stay 0.
UPDATE "PlanConfig" SET "platformFeeMinorIN" = 1000 WHERE "planId" = 'free';

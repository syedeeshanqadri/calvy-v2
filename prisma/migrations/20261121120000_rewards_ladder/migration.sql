-- AlterTable
ALTER TABLE "RewardProgress" ADD COLUMN     "bonus" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "RewardCount" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'VISIT';

-- CreateTable
CREATE TABLE "QuarterlyPerk" (
    "id" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "quarter" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuarterlyPerk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralCode" (
    "id" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerIdentity" TEXT NOT NULL,
    "referredIdentity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "appointmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qualifiedAt" TIMESTAMP(3),

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceSeen" (
    "id" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceSeen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuarterlyPerk_appointmentId_key" ON "QuarterlyPerk"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "QuarterlyPerk_identity_quarter_key" ON "QuarterlyPerk"("identity", "quarter");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_identity_key" ON "ReferralCode"("identity");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_referredIdentity_key" ON "Referral"("referredIdentity");

-- CreateIndex
CREATE INDEX "Referral_referrerIdentity_createdAt_idx" ON "Referral"("referrerIdentity", "createdAt");

-- CreateIndex
CREATE INDEX "DeviceSeen_deviceHash_idx" ON "DeviceSeen"("deviceHash");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceSeen_identity_deviceHash_key" ON "DeviceSeen"("identity", "deviceHash");


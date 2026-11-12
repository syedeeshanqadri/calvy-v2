-- CreateEnum
CREATE TYPE "WhatsAppStatus" AS ENUM ('PENDING', 'CONNECTED', 'ERROR');

-- AlterTable
ALTER TABLE "NotificationOutbox" ADD COLUMN     "deliveryError" TEXT,
ADD COLUMN     "deliveryStatus" TEXT;

-- CreateTable
CREATE TABLE "WhatsAppConfig" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "wabaId" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "appSecretEnc" TEXT NOT NULL,
    "webhookKey" TEXT NOT NULL,
    "verifyTokenEnc" TEXT NOT NULL,
    "status" "WhatsAppStatus" NOT NULL DEFAULT 'PENDING',
    "statusReason" TEXT,
    "displayPhone" TEXT,
    "verifiedName" TEXT,
    "qualityRating" TEXT,
    "messagingTier" TEXT,
    "lastCheckedAt" TIMESTAMPTZ(3),
    "errorNotifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WhatsAppConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppTemplate" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "metaId" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WhatsAppTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppOptOut" (
    "businessId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppOptOut_pkey" PRIMARY KEY ("businessId","phone")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConfig_businessId_key" ON "WhatsAppConfig"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConfig_webhookKey_key" ON "WhatsAppConfig"("webhookKey");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppTemplate_businessId_name_language_key" ON "WhatsAppTemplate"("businessId", "name", "language");

-- CreateIndex
CREATE INDEX "NotificationOutbox_providerId_idx" ON "NotificationOutbox"("providerId");


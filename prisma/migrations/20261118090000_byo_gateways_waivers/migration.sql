-- Additive only. BYO payment gateways (Mid/Top), per-business and per-service pay options, and the confirmation-fee waiver
-- that replaces the money wallet. The old CustomerCredit / WithdrawalRequest tables and Razorpay columns stay until the
-- pre-launch cleanup drops them.

-- CreateEnum
CREATE TYPE "GatewayProvider" AS ENUM ('RAZORPAY', 'CASHFREE', 'PHONEPE');

-- CreateEnum
CREATE TYPE "GatewayStatus" AS ENUM ('PENDING', 'CONNECTED', 'ERROR');

-- AlterEnum
ALTER TYPE "PayProvider" ADD VALUE 'RAZORPAY';
ALTER TYPE "PayProvider" ADD VALUE 'PHONEPE';

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "payOption" TEXT NOT NULL DEFAULT 'VENUE',
ADD COLUMN     "advanceKind" TEXT NOT NULL DEFAULT 'PERCENT',
ADD COLUMN     "advanceValue" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "payOption" TEXT,
ADD COLUMN     "advanceKind" TEXT,
ADD COLUMN     "advanceValue" INTEGER;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "gatewayId" TEXT,
ADD COLUMN     "gatewayRef" TEXT;

-- CreateTable
CREATE TABLE "PaymentGateway" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "provider" "GatewayProvider" NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'TEST',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "keyIdEnc" TEXT NOT NULL,
    "keySecretEnc" TEXT NOT NULL,
    "webhookSecretEnc" TEXT,
    "extra" TEXT,
    "webhookKey" TEXT NOT NULL,
    "status" "GatewayStatus" NOT NULL DEFAULT 'PENDING',
    "statusReason" TEXT,
    "lastVerifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentGateway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfirmationWaiver" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sourceAppointmentId" TEXT NOT NULL,
    "usedAppointmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ConfirmationWaiver_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentGateway_webhookKey_key" ON "PaymentGateway"("webhookKey");
CREATE UNIQUE INDEX "PaymentGateway_businessId_provider_mode_key" ON "PaymentGateway"("businessId", "provider", "mode");
CREATE INDEX "PaymentGateway_businessId_idx" ON "PaymentGateway"("businessId");
CREATE UNIQUE INDEX "ConfirmationWaiver_sourceAppointmentId_key" ON "ConfirmationWaiver"("sourceAppointmentId");
CREATE UNIQUE INDEX "ConfirmationWaiver_usedAppointmentId_key" ON "ConfirmationWaiver"("usedAppointmentId");
CREATE INDEX "ConfirmationWaiver_businessId_clientId_idx" ON "ConfirmationWaiver"("businessId", "clientId");
CREATE INDEX "Payment_gatewayId_idx" ON "Payment"("gatewayId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "PaymentGateway"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentGateway" ADD CONSTRAINT "PaymentGateway_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConfirmationWaiver" ADD CONSTRAINT "ConfirmationWaiver_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConfirmationWaiver" ADD CONSTRAINT "ConfirmationWaiver_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

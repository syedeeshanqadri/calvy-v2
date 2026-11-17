-- CreateEnum
CREATE TYPE "SubscriptionState" AS ENUM ('PENDING', 'AUTHORISED', 'ACTIVE', 'PAST_DUE', 'ENDED');

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "state" "SubscriptionState" NOT NULL DEFAULT 'PENDING',
    "cashfreeSubscriptionId" TEXT NOT NULL,
    "cfSubscriptionId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "creditMinor" INTEGER NOT NULL DEFAULT 0,
    "firstChargeMinor" INTEGER NOT NULL DEFAULT 0,
    "upgradeOfId" TEXT,
    "method" TEXT NOT NULL DEFAULT 'upi_card',
    "paymentMethodLabel" TEXT,
    "currentPeriodStart" TIMESTAMPTZ(3),
    "currentPeriodEnd" TIMESTAMPTZ(3),
    "nextChargeAt" TIMESTAMPTZ(3),
    "pendingPlanId" TEXT,
    "pendingInterval" TEXT,
    "chargePaymentId" TEXT,
    "chargeRaisedAt" TIMESTAMPTZ(3),
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "firstFailedAt" TIMESTAMPTZ(3),
    "graceUntil" TIMESTAMPTZ(3),
    "dunningSent" INTEGER NOT NULL DEFAULT 0,
    "lastChargeRetryAt" TIMESTAMPTZ(3),
    "endedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionInvoice" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "paymentKey" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "periodStart" TIMESTAMPTZ(3) NOT NULL,
    "periodEnd" TIMESTAMPTZ(3) NOT NULL,
    "grossMinor" INTEGER NOT NULL,
    "creditMinor" INTEGER NOT NULL DEFAULT 0,
    "amountMinor" INTEGER NOT NULL,
    "taxableMinor" INTEGER NOT NULL,
    "gstMinor" INTEGER NOT NULL,
    "gstRate" DOUBLE PRECISION NOT NULL,
    "paymentMethodLabel" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceCounter" (
    "fy" TEXT NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("fy")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_cashfreeSubscriptionId_key" ON "Subscription"("cashfreeSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_businessId_createdAt_idx" ON "Subscription"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "Subscription_state_nextChargeAt_idx" ON "Subscription"("state", "nextChargeAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionInvoice_number_key" ON "SubscriptionInvoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionInvoice_paymentKey_key" ON "SubscriptionInvoice"("paymentKey");

-- CreateIndex
CREATE INDEX "SubscriptionInvoice_businessId_issuedAt_idx" ON "SubscriptionInvoice"("businessId", "issuedAt");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;


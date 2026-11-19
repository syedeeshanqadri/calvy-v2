-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "billingMode" TEXT NOT NULL DEFAULT 'RECURRING',
ADD COLUMN     "cardUpdate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "gateway" TEXT NOT NULL DEFAULT 'CASHFREE',
ADD COLUMN     "linkRemindersSent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "linksReason" TEXT,
ADD COLUMN     "renewalForPeriodStart" TIMESTAMPTZ(3),
ADD COLUMN     "renewalLinkId" TEXT,
ADD COLUMN     "renewalLinkUrl" TEXT,
ADD COLUMN     "rzpPlanId" TEXT,
ADD COLUMN     "rzpSubscriptionId" TEXT;

-- AlterTable
ALTER TABLE "SubscriptionInvoice" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "lutNumber" TEXT,
ADD COLUMN     "taxKind" TEXT NOT NULL DEFAULT 'GST';

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_rzpSubscriptionId_key" ON "Subscription"("rzpSubscriptionId");


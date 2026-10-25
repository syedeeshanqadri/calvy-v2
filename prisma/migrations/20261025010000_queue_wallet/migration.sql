-- CreateEnum
CREATE TYPE "CreditKind" AS ENUM ('MISSED', 'CANCELLED', 'USED', 'REFUND_REMOVED', 'ADJUSTMENT');

-- AlterEnum
ALTER TYPE "QueueState" ADD VALUE 'CANCELLED';

-- CreateTable
CREATE TABLE "CustomerCredit" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" "CreditKind" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "appointmentId" TEXT,
    "paymentId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerCredit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerCredit_businessId_clientId_idx" ON "CustomerCredit"("businessId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerCredit_appointmentId_kind_key" ON "CustomerCredit"("appointmentId", "kind");

-- AddForeignKey
ALTER TABLE "CustomerCredit" ADD CONSTRAINT "CustomerCredit_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCredit" ADD CONSTRAINT "CustomerCredit_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCredit" ADD CONSTRAINT "CustomerCredit_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;


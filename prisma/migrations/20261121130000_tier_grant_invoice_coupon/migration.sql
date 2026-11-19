-- AlterTable
ALTER TABLE "SubscriptionInvoice" ADD COLUMN     "couponCode" TEXT,
ADD COLUMN     "couponMinor" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TierGrant" (
    "id" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TierGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TierGrant_identity_tier_key" ON "TierGrant"("identity", "tier");


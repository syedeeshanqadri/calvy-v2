-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "couponId" TEXT,
ADD COLUMN     "couponMinor" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "ownerKey" TEXT NOT NULL,
    "businessId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "minAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "maxRedemptions" INTEGER,
    "perCustomerLimit" INTEGER NOT NULL DEFAULT 1,
    "firstBookingOnly" BOOLEAN NOT NULL DEFAULT false,
    "planIds" TEXT[],
    "businessIds" TEXT[],
    "serviceIds" TEXT[],
    "durationMonths" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "appointmentId" TEXT,
    "subscriptionId" TEXT,
    "discountMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Coupon_businessId_idx" ON "Coupon"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_ownerKey_code_key" ON "Coupon"("ownerKey", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_appointmentId_key" ON "CouponRedemption"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_subscriptionId_key" ON "CouponRedemption"("subscriptionId");

-- CreateIndex
CREATE INDEX "CouponRedemption_couponId_identity_idx" ON "CouponRedemption"("couponId", "identity");

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;


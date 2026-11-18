-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "every" INTEGER NOT NULL DEFAULT 7,
    "params" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardProgress" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "counted" INTEGER NOT NULL DEFAULT 0,
    "earned" INTEGER NOT NULL DEFAULT 0,
    "used" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardCount" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "appointmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardRedemption" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Offer_key_key" ON "Offer"("key");

-- CreateIndex
CREATE UNIQUE INDEX "RewardProgress_offerId_identity_key" ON "RewardProgress"("offerId", "identity");

-- CreateIndex
CREATE UNIQUE INDEX "RewardCount_offerId_identity_day_key" ON "RewardCount"("offerId", "identity", "day");

-- CreateIndex
CREATE UNIQUE INDEX "RewardRedemption_appointmentId_key" ON "RewardRedemption"("appointmentId");

-- CreateIndex
CREATE INDEX "RewardRedemption_offerId_identity_idx" ON "RewardRedemption"("offerId", "identity");

-- AddForeignKey
ALTER TABLE "RewardProgress" ADD CONSTRAINT "RewardProgress_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardCount" ADD CONSTRAINT "RewardCount_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardRedemption" ADD CONSTRAINT "RewardRedemption_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;


INSERT INTO "Offer" ("id", "key", "kind", "name", "enabled", "every", "updatedAt")
VALUES ('offer_loyalty_every_8th', 'LOYALTY_EVERY_8TH', 'FREE_CONFIRMATION_EVERY_NTH', 'Every 8th visit: free Rs 10 confirmation', true, 7, CURRENT_TIMESTAMP);

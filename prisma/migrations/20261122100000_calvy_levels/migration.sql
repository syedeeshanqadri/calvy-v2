-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "feeLevel" TEXT,
ADD COLUMN     "feeMinor" INTEGER;

-- CreateTable
CREATE TABLE "LevelConfig" (
    "id" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LevelConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerLevel" (
    "id" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'STARTER',
    "levelSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttendedAt" TIMESTAMPTZ(3),
    "pendingLevelUp" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FastTrackBoost" (
    "id" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FastTrackBoost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerLevel_identity_key" ON "CustomerLevel"("identity");

-- CreateIndex
CREATE UNIQUE INDEX "FastTrackBoost_identity_month_key" ON "FastTrackBoost"("identity", "month");


-- Existing holders move to the equivalent level: Silver (10+ attended days) -> Regular, Gold (25+) -> Insider.
-- The Silver one-time Rs 10 was already granted (TierGrant SILVER stays); Insider's one free booking is marked given so Gold holders do not get it twice.
INSERT INTO "CustomerLevel" ("id", "identity", "level", "levelSince", "lastAttendedAt", "updatedAt")
SELECT gen_random_uuid()::text, rp."identity",
       CASE WHEN rp."counted" >= 25 THEN 'INSIDER' ELSE 'REGULAR' END,
       now(),
       COALESCE((SELECT MAX(rc."day")::date FROM "RewardCount" rc WHERE rc."identity" = rp."identity" AND rc."kind" = 'VISIT')::timestamptz, now()),
       now()
FROM "RewardProgress" rp
WHERE rp."counted" >= 10
ON CONFLICT ("identity") DO NOTHING;

INSERT INTO "TierGrant" ("id", "identity", "tier")
SELECT gen_random_uuid()::text, rp."identity", 'INSIDER'
FROM "RewardProgress" rp
WHERE rp."counted" >= 25
ON CONFLICT ("identity", "tier") DO NOTHING;

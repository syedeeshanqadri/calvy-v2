-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "notificationPrefs" JSONB;

-- CreateTable
CREATE TABLE "NotificationOptOut" (
    "businessId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationOptOut_pkey" PRIMARY KEY ("businessId","recipient")
);


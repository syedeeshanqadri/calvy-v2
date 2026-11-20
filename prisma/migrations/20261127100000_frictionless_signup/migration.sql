-- AlterTable
ALTER TABLE "User" ADD COLUMN     "ownershipTransferredAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "convertedAt" TIMESTAMP(3),
ADD COLUMN     "lastActivityAt" TIMESTAMP(3),
ADD COLUMN     "lastReminderAt" TIMESTAMP(3),
ADD COLUMN     "onboardingStep" INTEGER,
ADD COLUMN     "plan" TEXT,
ADD COLUMN     "remindersSent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unsubscribedAt" TIMESTAMP(3),
ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "OwnerLoginToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "step" INTEGER,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "OwnerLoginToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OwnerLoginToken_tokenHash_key" ON "OwnerLoginToken"("tokenHash");

-- CreateIndex
CREATE INDEX "OwnerLoginToken_userId_purpose_idx" ON "OwnerLoginToken"("userId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_userId_key" ON "Lead"("userId");

-- AddForeignKey
ALTER TABLE "OwnerLoginToken" ADD CONSTRAINT "OwnerLoginToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


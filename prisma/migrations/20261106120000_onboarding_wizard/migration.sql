ALTER TABLE "User" ADD COLUMN "googleId" TEXT;
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

ALTER TABLE "Business" ADD COLUMN "region" TEXT NOT NULL DEFAULT 'INTL';
ALTER TABLE "Business" ADD COLUMN "onboardingStep" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Business" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);
ALTER TABLE "Business" ADD COLUMN "intendedPlan" TEXT;

-- Every business that exists today is already set up: it never sees the wizard.
UPDATE "Business" SET "onboardingCompletedAt" = NOW(), "onboardingStep" = 8;
UPDATE "Business" SET "region" = 'IN' WHERE "currency" = 'INR';

-- Where a sign-up came from: the tenant site whose "Bookings by Calvy" link the person followed. Additive, nullable.
-- AlterTable
ALTER TABLE "User" ADD COLUMN "signupRef" TEXT;
ALTER TABLE "User" ADD COLUMN "signupSource" TEXT;
-- CreateIndex
CREATE INDEX "User_signupRef_idx" ON "User"("signupRef");

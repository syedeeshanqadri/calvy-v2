-- Private calendar feed tokens (Business and Staff). Additive only: nullable columns, created lazily when the owner first opens Settings.
-- AlterTable
ALTER TABLE "Business" ADD COLUMN "calendarToken" TEXT;

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN "calendarToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Business_calendarToken_key" ON "Business"("calendarToken");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_calendarToken_key" ON "Staff"("calendarToken");

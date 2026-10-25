-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "patientAge" INTEGER,
ADD COLUMN     "patientGender" TEXT,
ADD COLUMN     "patientRelation" TEXT;

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "maxPeoplePerBooker" INTEGER NOT NULL DEFAULT 4;

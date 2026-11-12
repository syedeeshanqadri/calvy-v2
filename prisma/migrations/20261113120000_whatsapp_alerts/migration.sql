-- AlterTable
ALTER TABLE "User" ADD COLUMN     "whatsappOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "whatsappPhone" TEXT,
ADD COLUMN     "whatsappVerifiedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "whatsappConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "whatsappConsentAt" TIMESTAMPTZ(3),
ADD COLUMN     "whatsappConsentSource" TEXT;


-- AlterTable
ALTER TABLE "WhatsAppConfig" ADD COLUMN     "lastEchoAt" TIMESTAMPTZ(3),
ADD COLUMN     "lastStateSyncAt" TIMESTAMPTZ(3),
ADD COLUMN     "historyProgress" INTEGER;

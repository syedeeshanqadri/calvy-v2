-- AlterTable
ALTER TABLE "WhatsAppConfig" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "coexistence" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pinEnc" TEXT,
ADD COLUMN     "paymentStatus" TEXT,
ADD COLUMN     "nameStatus" TEXT;

-- CreateTable
CREATE TABLE "WhatsAppWebhookEvent" (
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppWebhookEvent_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "WhatsAppWebhookEvent_createdAt_idx" ON "WhatsAppWebhookEvent"("createdAt");

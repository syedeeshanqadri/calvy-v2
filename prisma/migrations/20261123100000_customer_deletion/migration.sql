-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "anonymisedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CustomerDeletionRequest" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executeAfter" TIMESTAMPTZ(3) NOT NULL,
    "cancelTokenHash" TEXT,
    "processedAt" TIMESTAMP(3),
    "processedBy" TEXT,
    "reason" TEXT,

    CONSTRAINT "CustomerDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerDeletionRequest_customerId_key" ON "CustomerDeletionRequest"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerDeletionRequest_cancelTokenHash_key" ON "CustomerDeletionRequest"("cancelTokenHash");

-- CreateIndex
CREATE INDEX "CustomerDeletionRequest_status_executeAfter_idx" ON "CustomerDeletionRequest"("status", "executeAfter");

-- AddForeignKey
ALTER TABLE "CustomerDeletionRequest" ADD CONSTRAINT "CustomerDeletionRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;


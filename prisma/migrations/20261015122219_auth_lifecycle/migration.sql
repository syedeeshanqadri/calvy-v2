-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailDuplicateReport" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "recordIds" TEXT[],
    "businessId" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailDuplicateReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Flag (only flag; nothing is merged or removed) records whose emails collide when lowercased.
INSERT INTO "EmailDuplicateReport" ("id", "entity", "normalizedEmail", "recordIds", "businessId")
SELECT 'edr_' || md5(random()::text || clock_timestamp()::text || lower(email)),
       'user', lower(email), array_agg(id ORDER BY id), NULL
FROM "User"
GROUP BY lower(email)
HAVING count(*) > 1;

INSERT INTO "EmailDuplicateReport" ("id", "entity", "normalizedEmail", "recordIds", "businessId")
SELECT 'edr_' || md5(random()::text || clock_timestamp()::text || "businessId" || lower(email)),
       'client', lower(email), array_agg(id ORDER BY id), "businessId"
FROM "Client"
GROUP BY "businessId", lower(email)
HAVING count(*) > 1;

-- Lowercase existing emails only where that cannot collide with another record.
-- Rows in a duplicate group are left exactly as they are.
UPDATE "User" SET "email" = lower("email")
WHERE "email" <> lower("email")
  AND NOT EXISTS (
    SELECT 1 FROM "User" u2
    WHERE lower(u2."email") = lower("User"."email") AND u2."id" <> "User"."id"
  );

UPDATE "Client" SET "email" = lower("email")
WHERE "email" <> lower("email")
  AND NOT EXISTS (
    SELECT 1 FROM "Client" c2
    WHERE c2."businessId" = "Client"."businessId"
      AND lower(c2."email") = lower("Client"."email") AND c2."id" <> "Client"."id"
  );

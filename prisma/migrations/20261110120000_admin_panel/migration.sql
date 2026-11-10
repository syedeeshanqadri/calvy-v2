ALTER TABLE "User" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "adminTotpSecret" TEXT;
ALTER TABLE "User" ADD COLUMN "adminTotpEnabledAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "adminTotpLastStep" INTEGER;
ALTER TABLE "User" ADD COLUMN "adminRecoveryHashes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Existing admins keep access (they must now enroll in 2FA); nobody else is promoted.
UPDATE "User" SET "isSuperAdmin" = true WHERE "role" = 'admin';

ALTER TABLE "Business" ADD COLUMN "suspendedAt" TIMESTAMP(3);
ALTER TABLE "Business" ADD COLUMN "suspendedReason" TEXT;
ALTER TABLE "Business" ADD COLUMN "planOverridePlan" TEXT;
ALTER TABLE "Business" ADD COLUMN "planOverrideUntil" TIMESTAMP(3);
ALTER TABLE "Business" ADD COLUMN "planOverrideFromPlan" TEXT;
ALTER TABLE "Business" ADD COLUMN "planOverrideFromStatus" TEXT;

CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reauthAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "viewAsBusinessId" TEXT,
    "viewAsMode" TEXT,
    "viewAsReason" TEXT,
    "viewAsStartedAt" TIMESTAMP(3),
    "viewAsExpiresAt" TIMESTAMP(3),
    "viewAsAuditId" TEXT,
    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession"("tokenHash");
CREATE INDEX "AdminSession_userId_idx" ON "AdminSession"("userId");

CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "adminEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "businessId" TEXT,
    "reason" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");
CREATE INDEX "AdminAuditLog_businessId_createdAt_idx" ON "AdminAuditLog"("businessId", "createdAt");
CREATE INDEX "AdminAuditLog_action_createdAt_idx" ON "AdminAuditLog"("action", "createdAt");

-- Append-only: the database itself refuses to change or delete an audit row.
CREATE FUNCTION admin_audit_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AdminAuditLog is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER admin_audit_no_update BEFORE UPDATE ON "AdminAuditLog" FOR EACH ROW EXECUTE FUNCTION admin_audit_append_only();
CREATE TRIGGER admin_audit_no_delete BEFORE DELETE ON "AdminAuditLog" FOR EACH ROW EXECUTE FUNCTION admin_audit_append_only();
CREATE TRIGGER admin_audit_no_truncate BEFORE TRUNCATE ON "AdminAuditLog" FOR EACH STATEMENT EXECUTE FUNCTION admin_audit_append_only();

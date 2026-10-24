-- Normalize legacy plan values: trial -> free, starter -> professional ("Pro" in the UI).
UPDATE "Business" SET "plan" = 'free' WHERE "plan" = 'trial';
UPDATE "Business" SET "plan" = 'professional' WHERE "plan" = 'starter';
UPDATE "Business" SET "plan" = 'free' WHERE "plan" NOT IN ('free', 'professional', 'business');

-- planStatus consistent with the plan. Real billing states on paid plans
-- (past_due, cancelled, canceled, expired) are left untouched.
UPDATE "Business" SET "planStatus" = 'free' WHERE "plan" = 'free';
UPDATE "Business" SET "planStatus" = 'active'
  WHERE "plan" IN ('professional', 'business') AND "planStatus" IN ('free', 'trialing');

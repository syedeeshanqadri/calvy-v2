-- Free plan keeps email confirmations and reminders (only WhatsApp is a paid feature).
UPDATE "PlanConfig" SET "emailReminders" = true WHERE "planId" = 'free';

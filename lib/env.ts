import { z } from "zod";

// Describes every environment variable the app reads. This module only
// reports names (never values) and is not used to refactor existing reads.

const optional = z.string().optional();

/** Required in production. */
const requiredInProduction = {
  DATABASE_URL: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(1),
};

/** Optional: the matching feature/service is disabled when absent. */
const optionalVars = {
  NEXTAUTH_URL: optional,
  NEXT_PUBLIC_APP_URL: optional,
  NEXT_PUBLIC_ROOT_DOMAIN: optional,
  SUPER_ADMIN_EMAIL: optional,
  ADMIN_SETUP_SECRET: optional,
  CRON_SECRET: optional,
  RESEND_API_KEY: optional,
  EMAIL_FROM: optional,
  NOTIFY_EMAIL: optional,
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  FACEBOOK_CLIENT_ID: optional,
  FACEBOOK_CLIENT_SECRET: optional,
  WHATSAPP_PHONE_NUMBER_ID: optional,
  WHATSAPP_ACCESS_TOKEN: optional,
  BLOB_READ_WRITE_TOKEN: optional,
  S3_ENDPOINT: optional,
  S3_BUCKET: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
  S3_PUBLIC_URL: optional,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: optional,
  VAPID_PRIVATE_KEY: optional,
  VAPID_SUBJECT: optional,
  CASHFREE_APP_ID: optional,
  CASHFREE_SECRET_KEY: optional,
  CASHFREE_ENV: optional,
  RAZORPAY_KEY_ID: optional,
  RAZORPAY_KEY_SECRET: optional,
  RAZORPAY_WEBHOOK_SECRET: optional,
  RAZORPAY_BILLING_WEBHOOK_SECRET: optional,
  RAZORPAY_PLAN_STARTER: optional,
  RAZORPAY_PLAN_PROFESSIONAL: optional,
  RAZORPAY_PLAN_BUSINESS: optional,
  SHADOW_DATABASE_URL: optional,
  UPSTASH_REDIS_REST_URL: optional,
  UPSTASH_REDIS_REST_TOKEN: optional,
  SENTRY_DSN: optional,
  NEXT_PUBLIC_SENTRY_DSN: optional,
};

export const envSchema = z.object({ ...requiredInProduction, ...optionalVars });

export const REQUIRED_ENV = Object.keys(requiredInProduction);
export const OPTIONAL_ENV = Object.keys(optionalVars);

/** lib/storage.ts uses the s3 driver in production, so all of these are needed there. */
export const S3_ENV = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_URL"];

/** What each group of optional variables switches on (for startup logging). */
export const OPTIONAL_SERVICES: Record<string, string[]> = {
  email: ["RESEND_API_KEY"],
  whatsapp: ["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN"],
  razorpay: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"],
  "razorpay-webhooks": ["RAZORPAY_WEBHOOK_SECRET", "RAZORPAY_BILLING_WEBHOOK_SECRET"],
  "web-push": ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"],
  "file-uploads": ["BLOB_READ_WRITE_TOKEN"],
  "google-login": ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  "facebook-login": ["FACEBOOK_CLIENT_ID", "FACEBOOK_CLIENT_SECRET"],
  "cron-reminders": ["CRON_SECRET"],
  "distributed-rate-limit": ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
};

export interface EnvCheck {
  missingRequired: string[];
  missingOptional: string[];
}

function isSet(env: NodeJS.ProcessEnv, name: string) {
  const v = env[name];
  return typeof v === "string" && v.trim() !== "";
}

/** Returns the NAMES of missing variables only; never values. */
export function checkEnv(env: NodeJS.ProcessEnv = process.env): EnvCheck {
  return {
    missingRequired: REQUIRED_ENV.filter((n) => !isSet(env, n)),
    missingOptional: OPTIONAL_ENV.filter((n) => !isSet(env, n)),
  };
}

/** Names of S3 variables still missing when uploads will use the s3 driver (production default). */
export function missingStorageEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const driver = env.STORAGE_DRIVER ?? (env.NODE_ENV === "production" ? "s3" : "local");
  return driver === "s3" ? S3_ENV.filter((n) => !isSet(env, n)) : [];
}

/** Names of optional services that are disabled because a variable is missing. */
export function disabledServices(env: NodeJS.ProcessEnv = process.env): string[] {
  return Object.entries(OPTIONAL_SERVICES)
    .filter(([, vars]) => vars.some((v) => !isSet(env, v)))
    .map(([service]) => service);
}

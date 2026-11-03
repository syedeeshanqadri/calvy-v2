-- Customer accounts created automatically at booking have no password until the emailed link sets one.
ALTER TABLE "Customer" ALTER COLUMN "password" DROP NOT NULL;

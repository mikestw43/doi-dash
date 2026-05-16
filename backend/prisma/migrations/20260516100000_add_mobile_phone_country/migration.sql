-- AlterTable: add mobile and phoneCountry to User
ALTER TABLE "User" ADD COLUMN "mobile" TEXT;
ALTER TABLE "User" ADD COLUMN "phoneCountry" TEXT;

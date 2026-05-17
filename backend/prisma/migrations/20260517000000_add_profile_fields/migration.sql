-- AlterTable: add displayName, timezone, lastLoginAt to User
ALTER TABLE "User" ADD COLUMN "displayName" TEXT;
ALTER TABLE "User" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Bangkok';
ALTER TABLE "User" ADD COLUMN "lastLoginAt" DATETIME;

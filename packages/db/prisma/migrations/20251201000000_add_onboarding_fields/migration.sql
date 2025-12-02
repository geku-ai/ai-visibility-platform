-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN "onboardingStatus" TEXT NOT NULL DEFAULT 'not_started';
ALTER TABLE "workspaces" ADD COLUMN "onboardingEntryType" TEXT;
ALTER TABLE "workspaces" ADD COLUMN "primaryDomain" TEXT;
ALTER TABLE "workspaces" ADD COLUMN "brandName" TEXT;
ALTER TABLE "workspaces" ADD COLUMN "businessType" TEXT;
ALTER TABLE "workspaces" ADD COLUMN "location" JSONB;
ALTER TABLE "workspaces" ADD COLUMN "userRole" TEXT;
ALTER TABLE "workspaces" ADD COLUMN "competitors" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "workspaces" ADD COLUMN "businessSize" TEXT;
ALTER TABLE "workspaces" ADD COLUMN "goals" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "workspaces" ADD COLUMN "copilotPreferences" JSONB;


